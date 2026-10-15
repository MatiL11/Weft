import { describe, expect, it } from 'vitest'
import { InMemorySegmentStore } from './memory-segment-store'
import { findRecoverable, RecordingWriter } from './recording-writer'
import type { RecordingManifest } from './segment-store'

const bytes = (...values: number[]) => new Uint8Array(values)
const NOW = '2026-10-15T12:00:00.000Z'

function manifest(overrides: Partial<RecordingManifest> = {}): RecordingManifest {
  return {
    id: 'rec_1',
    createdAt: NOW,
    status: 'recording',
    mimeType: 'video/mp4',
    segmentCount: 0,
    durationMs: 0,
    ...overrides,
  }
}

describe('RecordingWriter', () => {
  it('persists init and segments in order and tracks progress in the manifest', async () => {
    const store = new InMemorySegmentStore()
    const writer = await RecordingWriter.open(store, manifest())

    writer.writeInit(bytes(1))
    writer.writeSegment({ index: 0, startTime: 0, data: bytes(10) })
    writer.writeSegment({ index: 1, startTime: 4, data: bytes(20) })
    await writer.flush()

    expect(await store.readAll('rec_1')).toEqual({
      init: bytes(1),
      segments: [bytes(10), bytes(20)],
    })
    expect((await store.list())[0]).toMatchObject({ segmentCount: 2, status: 'recording' })
  })

  it('marks the recording complete with its final duration', async () => {
    const store = new InMemorySegmentStore()
    const writer = await RecordingWriter.open(store, manifest())
    writer.writeInit(bytes(1))
    writer.writeSegment({ index: 0, startTime: 0, data: bytes(10) })

    await writer.complete(4200)

    expect((await store.list())[0]).toMatchObject({
      status: 'complete',
      segmentCount: 1,
      durationMs: 4200,
    })
  })

  it('serialises writes even when the store resolves out of order', async () => {
    const store = new InMemorySegmentStore({ writeDelayMs: (index) => (index === 0 ? 20 : 0) })
    const writer = await RecordingWriter.open(store, manifest())
    writer.writeInit(bytes(1))
    writer.writeSegment({ index: 0, startTime: 0, data: bytes(10) })
    writer.writeSegment({ index: 1, startTime: 4, data: bytes(20) })
    await writer.flush()

    expect(store.writeLog('rec_1')).toEqual(['init', 0, 1])
  })

  it('surfaces the first storage error and stops writing', async () => {
    const store = new InMemorySegmentStore({ failOnSegment: 1 })
    const writer = await RecordingWriter.open(store, manifest())
    writer.writeInit(bytes(1))
    writer.writeSegment({ index: 0, startTime: 0, data: bytes(10) })
    writer.writeSegment({ index: 1, startTime: 4, data: bytes(20) })
    writer.writeSegment({ index: 2, startTime: 8, data: bytes(30) })

    await expect(writer.flush()).rejects.toThrow(/quota/)
    expect(store.writeLog('rec_1')).toEqual(['init', 0])
  })

  it('deletes everything when discarded', async () => {
    const store = new InMemorySegmentStore()
    const writer = await RecordingWriter.open(store, manifest())
    writer.writeInit(bytes(1))
    await writer.discard()
    expect(await store.list()).toEqual([])
  })
})

describe('findRecoverable', () => {
  it('returns interrupted recordings that have media, newest first, excluding the active one', async () => {
    const store = new InMemorySegmentStore()
    await store.create(
      manifest({ id: 'old', createdAt: '2026-10-14T10:00:00.000Z', segmentCount: 3 }),
    )
    await store.create(
      manifest({ id: 'new', createdAt: '2026-10-15T10:00:00.000Z', segmentCount: 1 }),
    )
    await store.create(manifest({ id: 'empty', segmentCount: 0 }))
    await store.create(manifest({ id: 'done', status: 'complete', segmentCount: 5 }))
    await store.create(manifest({ id: 'active', segmentCount: 2 }))

    const ids = (await findRecoverable(store, { activeId: 'active' })).map((m) => m.id)

    expect(ids).toEqual(['new', 'old'])
  })
})

describe('RecordingWriter persistence signals', () => {
  it('resolves each write with whether it was persisted, and segments can be read back', async () => {
    const store = new InMemorySegmentStore({ failOnSegment: 1 })
    const writer = await RecordingWriter.open(store, manifest())

    await expect(writer.writeInit(bytes(1))).resolves.toBe(true)
    await expect(writer.writeSegment({ index: 0, startTime: 0, data: bytes(10) })).resolves.toBe(
      true,
    )
    await expect(writer.writeSegment({ index: 1, startTime: 4, data: bytes(20) })).resolves.toBe(
      false,
    )

    expect(await store.readSegment('rec_1', 'init', 0)).toEqual(bytes(1))
    expect(await store.readSegment('rec_1', 'media', 0)).toEqual(bytes(10))
    await expect(store.readSegment('rec_1', 'media', 1)).rejects.toThrow(/not stored/)
  })
})
