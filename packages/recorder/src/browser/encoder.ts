import {
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  MediaStreamAudioTrackSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny'
import { createFragmentCollector, type MediaSegment } from '../core/fragments'
import type { Size } from '../core/layout'

/** Target duration of each media segment, in seconds (also the upload unit later on). */
export const SEGMENT_SECONDS = 4
const KEYFRAME_INTERVAL_SECONDS = 2
const VIDEO_CODECS: VideoCodec[] = ['avc', 'vp9', 'av1']
const AUDIO_CODECS: AudioCodec[] = ['aac', 'opus']

type AudioTrackInput = ConstructorParameters<typeof MediaStreamAudioTrackSource>[0]

export class UnsupportedBrowserError extends Error {
  constructor(what: string) {
    super(`This browser cannot encode ${what}.`)
    this.name = 'UnsupportedBrowserError'
  }
}

export interface EncoderOptions {
  canvas: HTMLCanvasElement
  size: Size
  fps: number
  audioTrack: MediaStreamTrack | null
  onInit: (data: Uint8Array) => void
  onSegment: (segment: MediaSegment) => void
  /** Called once if encoding fails (e.g. the GPU encoder crashes). */
  onError: (error: unknown) => void
}

export interface EncoderInfo {
  /** Container type. The full type with codec parameters is only known after encoding starts. */
  mimeType: 'video/mp4'
  videoCodec: VideoCodec
  audioCodec: AudioCodec | null
}

/**
 * Encodes canvas frames (+ optional audio) into fragmented MP4 using WebCodecs through
 * Mediabunny. Audio starts paused so nothing is captured before recording begins.
 */
export class Encoder {
  private pendingFrame: Promise<void> | null = null

  private constructor(
    private readonly output: Output,
    private readonly video: CanvasSource,
    private readonly audio: MediaStreamAudioTrackSource | null,
    private readonly onError: (error: unknown) => void,
    readonly info: EncoderInfo,
  ) {}

  static async create(options: EncoderOptions): Promise<Encoder> {
    if (typeof VideoEncoder === 'undefined') throw new UnsupportedBrowserError('video (WebCodecs)')

    const videoCodec = await getFirstEncodableVideoCodec(VIDEO_CODECS, {
      width: options.size.width,
      height: options.size.height,
    })
    if (!videoCodec) throw new UnsupportedBrowserError('video')
    const audioCodec = options.audioTrack ? await getFirstEncodableAudioCodec(AUDIO_CODECS) : null
    if (options.audioTrack && !audioCodec) throw new UnsupportedBrowserError('audio')

    const collector = createFragmentCollector({
      onInit: options.onInit,
      onSegment: options.onSegment,
    })
    const format = new Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: SEGMENT_SECONDS,
      ...collector,
    })
    // Segments are delivered through the box callbacks above, so the byte stream is discarded.
    const target = new StreamTarget(new WritableStream({ write() {} }))
    const output = new Output({ format, target })

    const video = new CanvasSource(options.canvas, {
      codec: videoCodec,
      quality: QUALITY_HIGH,
      keyFrameInterval: KEYFRAME_INTERVAL_SECONDS,
    })
    output.addVideoTrack(video, { frameRate: options.fps })

    let audio: MediaStreamAudioTrackSource | null = null
    if (options.audioTrack && audioCodec) {
      audio = new MediaStreamAudioTrackSource(options.audioTrack as AudioTrackInput, {
        codec: audioCodec,
        quality: QUALITY_HIGH,
      })
      audio.errorPromise.catch(options.onError)
      output.addAudioTrack(audio)
    }

    await output.start()
    audio?.pause()
    return new Encoder(output, video, audio, options.onError, {
      mimeType: 'video/mp4',
      videoCodec,
      audioCodec,
    })
  }

  /**
   * Captures the current canvas as a frame at `timestampSeconds` (active recording time).
   * Drops the frame if the encoder is still busy, so a slow machine lowers the frame rate
   * instead of building an ever-growing queue.
   */
  addFrame(timestampSeconds: number, durationSeconds: number): void {
    if (this.pendingFrame) return
    this.pendingFrame = this.video
      .add(timestampSeconds, durationSeconds)
      .catch(this.onError)
      .finally(() => (this.pendingFrame = null))
  }

  pauseAudio(): void {
    this.audio?.pause()
  }

  resumeAudio(): void {
    this.audio?.resume()
  }

  /** Flushes the last fragment through the callbacks and closes the output. */
  async finalize(): Promise<void> {
    await this.pendingFrame
    await this.output.finalize()
  }

  async cancel(): Promise<void> {
    await this.output.cancel()
  }
}
