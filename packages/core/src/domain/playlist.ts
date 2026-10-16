/** HLS (fMP4) media playlists built from the recorded segment timeline. */

export interface TimelineSegment {
  index: number
  startMs: number
}

export interface PlayableSegment {
  index: number
  durationMs: number
}

/** Nominal segment length, used as target duration before any segment is known. */
const NOMINAL_SEGMENT_SECONDS = 4

/**
 * Contiguous segments from index 0 with a known duration. While recording, a segment's
 * duration is only known once the next one exists; once ended, the last one runs to the end.
 * Stops at the first gap so players never jump over missing media.
 */
export function playableSegments(
  segments: TimelineSegment[],
  options: { endedAtMs: number | null },
): PlayableSegment[] {
  const sorted = [...segments].sort((a, b) => a.index - b.index)
  const contiguous: TimelineSegment[] = []
  for (const segment of sorted) {
    if (segment.index !== contiguous.length) break
    contiguous.push(segment)
  }

  // The end of the recording only bounds the last segment if nothing comes after it.
  const reachesEnd = contiguous.length === sorted.length
  return contiguous.flatMap((segment, i) => {
    const next = contiguous[i + 1]
    const endMs = next ? next.startMs : reachesEnd ? options.endedAtMs : null
    return endMs === null ? [] : [{ index: segment.index, durationMs: endMs - segment.startMs }]
  })
}

export interface MediaPlaylistOptions {
  initUri: string
  segmentUri: (index: number) => string
  segments: PlayableSegment[]
  /** Ended recordings get a closed VOD playlist; otherwise players keep polling (EVENT). */
  ended: boolean
}

export function buildMediaPlaylist(options: MediaPlaylistOptions): string {
  const longestSeconds = Math.max(0, ...options.segments.map((s) => s.durationMs / 1000))
  const targetDuration = longestSeconds > 0 ? Math.ceil(longestSeconds) : NOMINAL_SEGMENT_SECONDS

  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    `#EXT-X-PLAYLIST-TYPE:${options.ended ? 'VOD' : 'EVENT'}`,
    '#EXT-X-INDEPENDENT-SEGMENTS',
    `#EXT-X-MAP:URI="${options.initUri}"`,
    ...options.segments.flatMap((s) => [
      `#EXTINF:${(s.durationMs / 1000).toFixed(3)},`,
      options.segmentUri(s.index),
    ]),
  ]
  if (options.ended) lines.push('#EXT-X-ENDLIST')
  return `${lines.join('\n')}\n`
}

export interface MasterPlaylistEntry {
  uri: string
  width: number
  height: number
  bandwidth: number
  codecs: string
}

/** Multivariant playlist listing the renditions of a finished render. */
export function buildMasterPlaylist(entries: readonly MasterPlaylistEntry[]): string {
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    ...entries.flatMap((e) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${e.bandwidth},RESOLUTION=${e.width}x${e.height},CODECS="${e.codecs}"`,
      e.uri,
    ]),
  ]
  return `${lines.join('\n')}\n`
}
