/** Pure ffmpeg argument builders and HLS metadata helpers for the renderer. */
import type { TrimRange } from '@weft/core'

export interface Dimensions {
  width: number
  height: number
}

const seconds = (ms: number) => (ms / 1000).toFixed(3)

/** Scales so the short side becomes `shortSide`, keeping the aspect ratio with even sizes. */
export function scaleFilter(source: Dimensions, shortSide: number): string {
  return source.width >= source.height ? `scale=-2:${shortSide}` : `scale=${shortSide}:-2`
}

/** Size of a source after scaling its short side, as ffmpeg's -2 rounding computes it. */
export function scaledDimensions(source: Dimensions, shortSide: number): Dimensions {
  const even = (value: number) => Math.round(value / 2) * 2
  return source.width >= source.height
    ? { width: even((source.width * shortSide) / source.height), height: shortSide }
    : { width: shortSide, height: even((source.height * shortSide) / source.width) }
}

/** Keyframes every 2 s so HLS segments can be cut at ~4 s without re-encoding. */
const KEYFRAME_SECONDS = 2

export interface EncodeOptions {
  input: string
  output: string
  scale: string
  trim: TrimRange | null
  /** Fast start puts the index first so browsers can play the MP4 while downloading. */
  faststart: boolean
}

export function encodeArgs(options: EncodeOptions): string[] {
  const trim = options.trim
    ? ['-ss', seconds(options.trim.startMs), '-to', seconds(options.trim.endMs)]
    : []
  // prettier-ignore
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    ...localMp4Input(options.input),
    ...trim,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-vf', options.scale,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-force_key_frames', `expr:gte(t,n_forced*${KEYFRAME_SECONDS})`,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',
    ...(options.faststart ? ['-movflags', '+faststart'] : []),
    options.output,
  ]
}

export const HLS_SEGMENT_SECONDS = 4

const MIN_TOOL_TIMEOUT_MS = 10 * 60 * 1000
/** The duration comes from the uploaded file's own header, so it can't stretch this forever. */
const MAX_TOOL_TIMEOUT_MS = 4 * 60 * 60 * 1000
/** Even a slow machine encodes far faster than this many times the video's length. */
const TOOL_TIMEOUT_PER_SOURCE_MS = 10

/** How long one ffmpeg step may run before it's considered stuck (and the render fails). */
export function toolTimeoutMs(sourceDurationMs: number): number {
  const scaled = Math.ceil(sourceDurationMs * TOOL_TIMEOUT_PER_SOURCE_MS)
  return Math.min(MAX_TOOL_TIMEOUT_MS, Math.max(MIN_TOOL_TIMEOUT_MS, scaled))
}

/**
 * Reads a local MP4 only: recordings come from browsers, so their bytes are untrusted. Pinning
 * the demuxer and the file protocol keeps ffmpeg from treating them as a playlist that points
 * at other files or URLs.
 */
export function localMp4Input(path: string): string[] {
  return ['-protocol_whitelist', 'file', '-f', 'mov', '-i', path]
}

/** Repackages an encoded MP4 as HLS fMP4 (no re-encode) into `directory`. */
export function hlsPackageArgs(input: string, directory: string): string[] {
  // prettier-ignore
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    ...localMp4Input(input),
    '-c', 'copy',
    '-f', 'hls',
    '-hls_time', String(HLS_SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', `${directory}/seg-%05d.m4s`,
    `${directory}/index.m3u8`,
  ]
}

/** A frame a moment into the video, so the poster isn't a black first frame. */
export function posterArgs(input: string, output: string, durationMs: number): string[] {
  const atMs = Math.min(1000, Math.floor(durationMs / 2))
  // prettier-ignore
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-ss', seconds(atMs),
    ...localMp4Input(input),
    '-frames:v', '1',
    '-vf', 'scale=-2:min(720\\,ih)',
    '-q:v', '3',
    output,
  ]
}

export interface SpriteOptions {
  input: string
  output: string
  intervalMs: number
  count: number
  columns: number
  tileWidth: number
}

/** One image holding a grid of thumbnails taken every `intervalMs`. */
export function spriteArgs(options: SpriteOptions): string[] {
  const rows = Math.ceil(options.count / options.columns)
  const fps = `fps=1000/${options.intervalMs}`
  // prettier-ignore
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    ...localMp4Input(options.input),
    '-vf', `${fps},scale=${options.tileWidth}:-2,tile=${options.columns}x${rows}`,
    '-frames:v', '1',
    '-q:v', '5',
    options.output,
  ]
}

export function tileHeight(source: Dimensions, tileWidth: number): number {
  return Math.max(2, Math.round((source.height * tileWidth) / source.width / 2) * 2)
}

const AVC_PROFILES: Record<string, number> = {
  Baseline: 0x42,
  'Constrained Baseline': 0x42,
  Main: 0x4d,
  High: 0x64,
}

/** RFC 6381 codec string for an H.264 stream, e.g. High@4.0 → avc1.640028. */
export function avcCodec(profile: string, level: number): string {
  const profileIdc = AVC_PROFILES[profile] ?? 0x64
  const constraints = profile === 'Constrained Baseline' ? 0xe0 : 0
  const hex = (value: number) => value.toString(16).padStart(2, '0')
  return `avc1.${hex(profileIdc)}${hex(constraints)}${hex(level)}`
}

/** AAC-LC, the only audio codec renders use. */
export const AAC_CODEC = 'mp4a.40.2'

/** Highest bitrate of any segment in an HLS media playlist, for the BANDWIDTH attribute. */
export function peakBandwidth(playlist: string, segmentBytes: (uri: string) => number): number {
  const lines = playlist.split('\n').map((line) => line.trim())
  let peak = 0
  lines.forEach((line, i) => {
    if (!line.startsWith('#EXTINF:')) return
    const duration = Number.parseFloat(line.slice('#EXTINF:'.length))
    const uri = lines[i + 1]
    if (!uri || !(duration > 0)) return
    peak = Math.max(peak, Math.ceil((segmentBytes(uri) * 8) / duration))
  })
  return peak
}
