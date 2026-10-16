/**
 * Rendering: after a recording ends, a background worker turns its raw segments into
 * streaming renditions, a downloadable MP4, a poster and hover thumbnails. The raw
 * segments are never modified, so trims can always be changed or undone.
 */
import { DomainError } from './errors'

/** none: nothing requested yet (still recording) · failed: the latest attempt gave up. */
export type RenderState = 'none' | 'queued' | 'processing' | 'ready' | 'failed'

export interface TrimRange {
  readonly startMs: number
  readonly endMs: number
}

export interface Rendition {
  readonly width: number
  readonly height: number
  /** Peak bits per second, as HLS BANDWIDTH. */
  readonly bandwidth: number
  /** RFC 6381 codecs string, e.g. "avc1.640028,mp4a.40.2". */
  readonly codecs: string
}

/** A grid of evenly spaced thumbnails in one image, used for hover previews. */
export interface ThumbnailSprite {
  readonly columns: number
  readonly count: number
  readonly intervalMs: number
  readonly tileWidth: number
  readonly tileHeight: number
}

export interface VideoRender {
  readonly version: number
  /** The trim baked into this render; its timeline starts at the trim start. */
  readonly trim: TrimRange | null
  readonly durationMs: number
  /** Highest quality first. */
  readonly renditions: readonly Rendition[]
  readonly sprite: ThumbnailSprite
  readonly mp4ByteLength: number
}

/** What the worker produces; the use case adds the version and trim. */
export type RenderOutput = Omit<VideoRender, 'version' | 'trim'>

export const MIN_TRIMMED_DURATION_MS = 1000

/**
 * Validates a trim against the recording length. A trim that keeps everything is the same
 * as no trim, so it normalizes to null.
 */
export function normalizeTrim(trim: TrimRange | null, durationMs: number): TrimRange | null {
  if (trim === null) return null
  const { startMs, endMs } = trim
  const valid =
    Number.isInteger(startMs) &&
    Number.isInteger(endMs) &&
    startMs >= 0 &&
    endMs <= durationMs &&
    endMs - startMs >= MIN_TRIMMED_DURATION_MS
  if (!valid) {
    throw new DomainError(
      'video.trim_invalid',
      `Trim must keep at least ${MIN_TRIMMED_DURATION_MS} ms within 0…${durationMs} ms.`,
    )
  }
  return startMs === 0 && endMs === durationMs ? null : { startMs, endMs }
}

export function sameTrim(a: TrimRange | null, b: TrimRange | null): boolean {
  return a?.startMs === b?.startMs && a?.endMs === b?.endMs
}

/**
 * Which media a player should load. A render is used only if it matches the current trim;
 * otherwise the raw recording plays and the player skips what the trim removes.
 */
export type PlaybackSource =
  { kind: 'render'; render: VideoRender } | { kind: 'raw'; skip: TrimRange | null }

export function playbackSource(video: {
  status: string
  trim: TrimRange | null
  render: VideoRender | null
}): PlaybackSource {
  if (video.status === 'ready' && video.render && sameTrim(video.render.trim, video.trim)) {
    return { kind: 'render', render: video.render }
  }
  return { kind: 'raw', skip: video.trim }
}

/** Duration viewers see, after the trim. */
export function visibleDurationMs(video: {
  durationMs: number | null
  trim: TrimRange | null
}): number | null {
  if (video.trim) return video.trim.endMs - video.trim.startMs
  return video.durationMs
}

/** Target heights (short side) of the streaming ladder, best first. */
const LADDER = [1080, 720] as const

/** Renditions to produce for a source: the ladder steps it can fill, or the source itself. */
export function renditionShortSides(sourceShortSide: number): number[] {
  const steps = LADDER.filter((side) => side <= sourceShortSide)
  return steps.length > 0 ? [...steps] : [evenFloor(sourceShortSide)]
}

const evenFloor = (value: number) => Math.max(2, Math.floor(value / 2) * 2)

/** At most this many hover thumbnails, at least this far apart. */
const MAX_THUMBNAILS = 100
const MIN_THUMBNAIL_INTERVAL_MS = 1000
export const THUMBNAIL_COLUMNS = 10
export const THUMBNAIL_WIDTH = 160

export function thumbnailPlan(durationMs: number): { intervalMs: number; count: number } {
  const intervalMs = Math.max(MIN_THUMBNAIL_INTERVAL_MS, Math.ceil(durationMs / MAX_THUMBNAILS))
  return { intervalMs, count: Math.max(1, Math.ceil(durationMs / intervalMs)) }
}

/** Storage prefix of one render; each version gets its own so players never mix them. */
export function renderPrefix(videoId: string, version: number): string {
  return `videos/${videoId}/r${version}/`
}

/** Files a render contains, relative to its prefix. Anything else is rejected. */
const RENDER_ASSET =
  /^(video\.mp4|poster\.jpg|sprite\.jpg|\d{3,4}p\/(index\.m3u8|init\.mp4|seg-\d{5}\.m4s))$/

export function isRenderAsset(path: string): boolean {
  return RENDER_ASSET.test(path)
}

export function renditionDirectory(rendition: { width: number; height: number }): string {
  return `${Math.min(rendition.width, rendition.height)}p`
}
