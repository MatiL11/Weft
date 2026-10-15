import type { MediaSegment } from '../core/fragments'
import type { BubbleOptions } from '../core/layout'
import { RecordingWriter } from '../core/recording-writer'
import type { SegmentStore } from '../core/segment-store'
import type { SegmentDescriptor } from '../core/upload-queue'
import {
  createSession,
  elapsedMs,
  remainingCountdownMs,
  transition,
  type SessionEvent,
  type SessionState,
  type StopReason,
} from '../core/session'
import { mixAudio, type MixedAudio } from './audio-mixer'
import { RECORDING_FRAME_RATE, stopStream } from './capture'
import { Compositor } from './compositor'
import { Encoder } from './encoder'
import { startTicker, type Ticker } from './ticker'

export type RecorderPhase =
  'countdown' | 'recording' | 'paused' | 'finishing' | 'finished' | 'cancelled' | 'failed'

export type RecorderErrorCode = 'encoding_failed' | 'storage_failed'

export interface RecorderSnapshot {
  phase: RecorderPhase
  /** Active recording time, excluding pauses. */
  elapsedMs: number
  limitMs: number
  countdownRemainingMs: number
  recordingId: string
  stopReason: StopReason | null
  error: RecorderErrorCode | null
}

export interface RecorderSources {
  screen?: MediaStream | null
  camera?: MediaStream | null
  microphone?: MediaStream | null
}

export interface RecorderOptions {
  store: SegmentStore
  /** The recorder takes ownership of these streams and stops them when it ends. */
  sources: RecorderSources
  bubble: BubbleOptions
  countdownMs: number
  limitMs: number
  fps?: number
  now?: () => number
  createId?: () => string
  /** Called once each segment is safely in local storage (e.g. to queue its upload). */
  onSegmentStored?: (segment: SegmentDescriptor) => void
}

export interface FinishedRecording {
  id: string
  durationMs: number
  mimeType: string
  /** Number of media segments produced (the init segment is not counted). */
  segmentCount: number
}

type Listener = (snapshot: RecorderSnapshot) => void

/**
 * Orchestrates one recording: session state, compositing, encoding and local persistence.
 * UI code subscribes to snapshots (React: useSyncExternalStore) and calls the commands.
 */
export class Recorder {
  private session: SessionState
  private phaseOverride: RecorderPhase | null = null
  private error: RecorderErrorCode | null = null
  private ticker: Ticker | null = null
  private listeners = new Set<Listener>()
  private snapshot: RecorderSnapshot
  private finishing: Promise<FinishedRecording> | null = null

  private constructor(
    private readonly options: Required<Pick<RecorderOptions, 'fps' | 'now'>> & RecorderOptions,
    private readonly compositor: Compositor,
    private readonly encoder: Encoder,
    private readonly writer: RecordingWriter,
    private readonly audio: MixedAudio | null,
  ) {
    this.session = createSession({ limitMs: options.limitMs })
    this.snapshot = this.buildSnapshot()
  }

  /** Builds the pipeline and starts the countdown. */
  static async start(input: RecorderOptions): Promise<Recorder> {
    const options = { fps: RECORDING_FRAME_RATE, now: () => performance.now(), ...input }
    const { sources } = options
    const screenTrack = sources.screen?.getVideoTracks()[0]
    const cameraTrack = sources.camera?.getVideoTracks()[0]
    const audioTracks = [
      ...(sources.microphone?.getAudioTracks() ?? []),
      ...(sources.screen?.getAudioTracks() ?? []),
    ]

    const compositor = await Compositor.create(
      {
        ...(screenTrack ? { screen: screenTrack } : {}),
        ...(cameraTrack ? { camera: cameraTrack } : {}),
      },
      options.bubble,
    )
    const audio = mixAudio(audioTracks)
    const id = options.createId?.() ?? crypto.randomUUID()

    let recorder: Recorder | null = null
    const fail = (code: RecorderErrorCode) => recorder?.fail(code)

    // The encoder may emit data before the writer exists; buffer it until then.
    const pending = { init: null as Uint8Array | null, segments: [] as MediaSegment[] }
    const encoder = await Encoder.create({
      canvas: compositor.canvas,
      size: compositor.size,
      fps: options.fps,
      audioTrack: audio?.track ?? null,
      onInit: (data) => (recorder ? recorder.persistInit(data) : (pending.init = data)),
      onSegment: (segment) =>
        recorder ? recorder.persistSegment(segment) : pending.segments.push(segment),
      onError: () => fail('encoding_failed'),
    })
    const writer = await RecordingWriter.open(options.store, {
      id,
      createdAt: new Date().toISOString(),
      status: 'recording',
      mimeType: encoder.info.mimeType,
      videoCodec: encoder.info.videoCodec,
      ...(encoder.info.audioCodec ? { audioCodec: encoder.info.audioCodec } : {}),
      segmentCount: 0,
      durationMs: 0,
    })
    recorder = new Recorder(options, compositor, encoder, writer, audio)
    if (pending.init) recorder.persistInit(pending.init)
    pending.segments.forEach((segment) => recorder?.persistSegment(segment))
    recorder.begin(screenTrack ?? null)
    return recorder
  }

  private mediaSegmentCount = 0

  private persistInit(data: Uint8Array): void {
    void this.writer.writeInit(data).then((stored) => {
      if (stored) this.options.onSegmentStored?.({ kind: 'init', index: 0, startMs: 0 })
    })
  }

  private persistSegment(segment: MediaSegment): void {
    this.mediaSegmentCount = Math.max(this.mediaSegmentCount, segment.index + 1)
    void this.writer.writeSegment(segment).then((stored) => {
      if (!stored) return
      this.options.onSegmentStored?.({
        kind: 'media',
        index: segment.index,
        startMs: Math.round(segment.startTime * 1000),
      })
    })
  }

  get id(): string {
    return this.writer.id
  }

  /** The composited output, for showing a live preview of what is being recorded. */
  get previewCanvas(): HTMLCanvasElement {
    return this.compositor.canvas
  }

  getSnapshot = (): RecorderSnapshot => this.snapshot

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setBubble(bubble: BubbleOptions): void {
    this.compositor.setBubble(bubble)
  }

  pause(): void {
    if (this.apply({ type: 'pause', at: this.options.now() })) this.encoder.pauseAudio()
  }

  resume(): void {
    if (this.apply({ type: 'resume', at: this.options.now() })) this.encoder.resumeAudio()
  }

  /** Stops recording and finalises the file. Safe to call more than once. */
  stop(): Promise<FinishedRecording> {
    this.apply({ type: 'stop', at: this.options.now() })
    return this.finish()
  }

  async cancel(): Promise<void> {
    if (!this.apply({ type: 'cancel' })) return
    this.teardownCapture()
    await this.encoder.cancel().catch(() => undefined)
    await this.writer.discard()
    this.publish()
  }

  private begin(screenTrack: MediaStreamTrack | null): void {
    const now = this.options.now()
    this.apply({ type: 'start', at: now, countdownMs: this.options.countdownMs })
    if (this.session.status === 'recording') this.encoder.resumeAudio()
    // The user can end screen sharing from the browser's own UI; treat it as "stop".
    screenTrack?.addEventListener('ended', () => void this.stop(), { once: true })
    this.ticker = startTicker(this.options.fps, () => this.onTick())
  }

  private onTick(): void {
    if (this.writer.error) return this.fail('storage_failed')

    const wasCountingDown = this.session.status === 'countdown'
    this.apply({ type: 'tick', at: this.options.now() })

    if (this.session.status === 'recording') {
      if (wasCountingDown) this.encoder.resumeAudio()
      this.compositor.draw()
      const elapsed = elapsedMs(this.session, this.options.now())
      this.encoder.addFrame(elapsed / 1000, 1 / this.options.fps)
    } else if (this.session.status === 'stopped') {
      void this.finish()
    }
    this.publishIfChanged()
  }

  private finish(): Promise<FinishedRecording> {
    if (this.finishing) return this.finishing
    this.phaseOverride = 'finishing'
    this.publish()

    this.finishing = (async () => {
      this.teardownCapture()
      // Whole milliseconds: the clock is fractional, but durations are stored as integers.
      const durationMs = Math.round(elapsedMs(this.session, this.options.now()))
      try {
        await this.encoder.finalize()
        await this.writer.complete(durationMs)
      } catch (error) {
        this.error = this.writer.error ? 'storage_failed' : 'encoding_failed'
        this.phaseOverride = 'failed'
        this.publish()
        throw error
      }
      this.phaseOverride = 'finished'
      this.publish()
      return {
        id: this.id,
        durationMs,
        mimeType: this.encoder.info.mimeType,
        segmentCount: this.mediaSegmentCount,
      }
    })()
    return this.finishing
  }

  private fail(code: RecorderErrorCode): void {
    if (this.error) return
    this.error = code
    this.apply({ type: 'fail', reason: code })
    this.phaseOverride = 'failed'
    this.teardownCapture()
    void this.encoder.cancel().catch(() => undefined)
    this.publish()
  }

  private teardownCapture(): void {
    this.ticker?.stop()
    this.ticker = null
    this.compositor.dispose()
    void this.audio?.close()
    const { screen, camera, microphone } = this.options.sources
    ;[screen, camera, microphone].forEach(stopStream)
  }

  /** Applies a session event; returns whether it changed the state. */
  private apply(event: SessionEvent): boolean {
    const next = transition(this.session, event)
    if (next === this.session) return false
    this.session = next
    this.publish()
    return true
  }

  private buildSnapshot(): RecorderSnapshot {
    const now = this.options.now()
    const status = this.session.status
    const phase: RecorderPhase =
      this.phaseOverride ??
      (status === 'stopped' ? 'finishing' : status === 'idle' ? 'countdown' : status)
    return {
      phase,
      elapsedMs: elapsedMs(this.session, now),
      limitMs: this.session.limitMs,
      countdownRemainingMs: remainingCountdownMs(this.session, now),
      recordingId: this.writer.id,
      stopReason: this.session.stopReason,
      error: this.error,
    }
  }

  /** Re-renders only when something visible changed (phase or a whole second). */
  private publishIfChanged(): void {
    const next = this.buildSnapshot()
    const prev = this.snapshot
    const second = (ms: number) => Math.floor(ms / 1000)
    const changed =
      next.phase !== prev.phase ||
      second(next.elapsedMs) !== second(prev.elapsedMs) ||
      Math.ceil(next.countdownRemainingMs / 1000) !== Math.ceil(prev.countdownRemainingMs / 1000)
    if (changed) this.publish(next)
  }

  private publish(snapshot = this.buildSnapshot()): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener(snapshot))
  }
}

/** Assembles a stored recording (init + segments) into a playable file. */
export async function exportRecording(store: SegmentStore, id: string): Promise<Blob> {
  const manifest = (await store.list()).find((m) => m.id === id)
  const { init, segments } = await store.readAll(id)
  return new Blob([init, ...segments] as BlobPart[], { type: manifest?.mimeType ?? 'video/mp4' })
}
