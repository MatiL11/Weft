import { describe, expect, it } from 'vitest'
import { InMemorySegmentStore } from '../core/memory-segment-store'
import { UploadQueue, type UploadApi } from '../core/upload-queue'
import { Recorder } from './recorder'
import { fakeMicrophone, fakeScreen, sleep } from './test-media'
import { isRetryableStatus, sha256Base64 } from './upload-adapters'

describe('sha256Base64', () => {
  it('matches the standard SHA-256 test vector', async () => {
    expect(await sha256Base64(new TextEncoder().encode('abc'))).toBe(
      'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    )
  })
})

describe('isRetryableStatus', () => {
  it.each([
    [403, true],
    [408, true],
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [404, false],
    [413, false],
  ])('%i → %s', (status, expected) => {
    expect(isRetryableStatus(status)).toBe(expected)
  })
})

describe('Recorder → UploadQueue', () => {
  it('queues every stored segment for upload while recording and reports the count', async () => {
    const store = new InMemorySegmentStore()
    const uploaded: string[] = []
    const api: UploadApi = {
      prepare: async (req) => ({ url: `mem://${req.kind}/${req.index}` }),
      confirm: async () => undefined,
      complete: async () => undefined,
    }
    const queue = new UploadQueue({
      api,
      transport: { put: async (url, data) => void uploaded.push(`${url}:${data.byteLength}`) },
      sha256: sha256Base64,
    })

    const recorder = await Recorder.start({
      store,
      sources: { screen: fakeScreen().stream, microphone: fakeMicrophone() },
      bubble: { position: 'bottom-left', size: 'medium' },
      countdownMs: 0,
      limitMs: 60_000,
      onSegmentStored: (segment) =>
        queue.enqueue({
          ...segment,
          load: () => store.readSegment(recorder.id, segment.kind, segment.index),
        }),
    })
    await sleep(9_000)
    // Segments upload during the recording, not only at the end.
    expect(uploaded.some((u) => u.startsWith('mem://media/0'))).toBe(true)

    const result = await recorder.stop()
    await queue.finish({ durationMs: result.durationMs, segmentCount: result.segmentCount })

    expect(result.segmentCount).toBeGreaterThanOrEqual(2)
    expect(uploaded.filter((u) => u.startsWith('mem://media')).length).toBe(result.segmentCount)
    expect(uploaded.filter((u) => u.startsWith('mem://init')).length).toBe(1)
    expect(queue.getSnapshot()).toMatchObject({ failed: 0, pending: 0 })
  })
})
