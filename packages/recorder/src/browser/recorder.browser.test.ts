import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { describe, expect, it } from 'vitest'
import { InMemorySegmentStore } from '../core/memory-segment-store'
import { findRecoverable } from '../core/recording-writer'
import { requestCamera } from './capture'
import { OpfsSegmentStore } from './opfs-store'
import { exportRecording, Recorder, type RecorderOptions } from './recorder'
import { fakeMicrophone, fakeScreen, sleep } from './test-media'

const BUBBLE = { position: 'bottom-left', size: 'medium' } as const

async function inspect(blob: Blob) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const video = await input.getPrimaryVideoTrack()
  const audio = await input.getPrimaryAudioTrack()
  return {
    duration: await input.computeDuration(),
    width: video?.displayWidth,
    height: video?.displayHeight,
    hasAudio: audio !== null,
  }
}

function options(overrides: Partial<RecorderOptions> = {}): RecorderOptions {
  return {
    store: new InMemorySegmentStore(),
    sources: { screen: fakeScreen().stream, microphone: fakeMicrophone() },
    bubble: BUBBLE,
    countdownMs: 0,
    limitMs: 60_000,
    ...overrides,
  }
}

describe('Recorder (real Chromium, WebCodecs + Mediabunny)', () => {
  it('records screen, camera bubble and microphone into a playable segmented MP4', async () => {
    const store = new InMemorySegmentStore()
    const camera = await requestCamera()
    const recorder = await Recorder.start(
      options({
        store,
        sources: { screen: fakeScreen().stream, camera, microphone: fakeMicrophone() },
      }),
    )
    expect(recorder.getSnapshot().phase).toBe('recording')

    await sleep(9_000)
    const result = await recorder.stop()

    expect(recorder.getSnapshot().phase).toBe('finished')
    expect(result.durationMs).toBeGreaterThan(8_500)
    expect(Number.isInteger(result.durationMs)).toBe(true)
    const stored = await store.readAll(result.id)
    expect(stored.init.byteLength).toBeGreaterThan(0)
    expect(stored.segments.length).toBeGreaterThanOrEqual(2)

    const file = await inspect(await exportRecording(store, result.id))
    expect(file.duration).toBeGreaterThan(8.5)
    expect(file.duration).toBeLessThan(10)
    expect([file.width, file.height]).toEqual([1280, 720])
    expect(file.hasAudio).toBe(true)
    // The recorder stops the capture so the browser's "sharing" indicator goes away.
    expect(camera.getVideoTracks()[0]?.readyState).toBe('ended')
  })

  it('excludes paused time from the recording', async () => {
    const store = new InMemorySegmentStore()
    const recorder = await Recorder.start(options({ store }))
    await sleep(2_000)
    recorder.pause()
    expect(recorder.getSnapshot().phase).toBe('paused')
    await sleep(2_000)
    recorder.resume()
    await sleep(2_000)
    const result = await recorder.stop()

    expect(result.durationMs).toBeGreaterThan(3_700)
    expect(result.durationMs).toBeLessThan(4_600)
    const file = await inspect(await exportRecording(store, result.id))
    expect(file.duration).toBeGreaterThan(3.5)
    expect(file.duration).toBeLessThan(4.8)
  })

  it('counts down before recording', async () => {
    const recorder = await Recorder.start(options({ countdownMs: 1_500 }))
    expect(recorder.getSnapshot().phase).toBe('countdown')
    await sleep(2_000)
    expect(recorder.getSnapshot().phase).toBe('recording')
    await recorder.cancel()
  })

  it('stops by itself at the duration limit', async () => {
    const recorder = await Recorder.start(options({ limitMs: 2_000 }))
    await sleep(3_500)
    const snapshot = recorder.getSnapshot()
    expect(snapshot.phase).toBe('finished')
    expect(snapshot.stopReason).toBe('limit')
    expect(snapshot.elapsedMs).toBe(2_000)
  })

  it('stops when the user ends screen sharing from the browser UI', async () => {
    const screen = fakeScreen()
    const recorder = await Recorder.start(options({ sources: { screen: screen.stream } }))
    await sleep(1_000)
    // Simulates the browser's "Stop sharing" button, which ends the track.
    const track = screen.stream.getVideoTracks()[0]
    track?.dispatchEvent(new Event('ended'))
    await sleep(1_500)
    expect(recorder.getSnapshot().phase).toBe('finished')
  })

  it('records camera only, filling the frame', async () => {
    const store = new InMemorySegmentStore()
    const recorder = await Recorder.start(
      options({ store, sources: { camera: await requestCamera() } }),
    )
    await sleep(2_500)
    const result = await recorder.stop()
    const file = await inspect(await exportRecording(store, result.id))
    expect([file.width, file.height]).toEqual([1280, 720])
    expect(file.hasAudio).toBe(false)
  })

  it('discards everything when cancelled', async () => {
    const store = new InMemorySegmentStore()
    const recorder = await Recorder.start(options({ store }))
    await sleep(1_000)
    await recorder.cancel()
    expect(recorder.getSnapshot().phase).toBe('cancelled')
    expect(await store.list()).toEqual([])
  })
})

describe('OpfsSegmentStore', () => {
  it('persists segments on disk so an interrupted recording can be recovered', async () => {
    const store = await OpfsSegmentStore.open()
    const recorder = await Recorder.start(options({ store }))
    await sleep(5_000)

    // Simulate a crash: the recording never completes, but its segments are on disk.
    const recoverable = await findRecoverable(store)
    expect(recoverable.map((m) => m.id)).toContain(recorder.id)

    const blob = await exportRecording(store, recorder.id)
    const file = await inspect(blob)
    expect(file.duration).toBeGreaterThan(3)

    await recorder.cancel()
    expect((await store.list()).some((m) => m.id === recorder.id)).toBe(false)
  })
})
