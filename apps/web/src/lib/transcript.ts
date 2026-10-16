/** Pure helpers for transcripts: the line being spoken, search and match highlighting. */

export interface TranscriptSegment {
  startMs: number
  endMs: number
  text: string
}

export interface TranscriptView {
  language: string
  segments: TranscriptSegment[]
}

/** Index of the segment being spoken at `ms` (segments are sorted), or -1 between lines. */
export function activeSegmentIndex(segments: readonly TranscriptSegment[], ms: number): number {
  let low = 0
  let high = segments.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const segment = segments[mid] as TranscriptSegment
    if (ms < segment.startMs) high = mid - 1
    else if (ms >= segment.endMs) low = mid + 1
    else return mid
  }
  return -1
}

/** Lowercase without accents, so "camion" finds "Camión". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Indices of segments containing the query (accent- and case-insensitive). */
export function searchSegments(segments: readonly TranscriptSegment[], query: string): number[] {
  const needle = fold(query.trim())
  if (!needle) return []
  return segments.flatMap((s, i) => (fold(s.text).includes(needle) ? [i] : []))
}

/** Splits text into parts, marking those that match the query, for highlighting. */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const needle = fold(query.trim())
  if (!needle) return [{ text, match: false }]
  // Folding can drop marks (é → e), so positions in the folded text are mapped back to the
  // original characters through a per-character fold.
  const folded = [...text].map((char) => fold(char))
  const haystack = folded.join('')
  const parts: { text: string; match: boolean }[] = []
  const chars = [...text]
  let position = 0
  let charIndex = 0
  const toChar = (offset: number) => {
    // Advance charIndex until the folded prefix reaches `offset`.
    while (charIndex < chars.length && position < offset) {
      position += folded[charIndex]?.length ?? 0
      charIndex += 1
    }
    return charIndex
  }
  let start = 0
  let from = haystack.indexOf(needle)
  while (from !== -1) {
    const matchStart = toChar(from)
    const matchEnd = toChar(from + needle.length)
    if (matchStart > start)
      parts.push({ text: chars.slice(start, matchStart).join(''), match: false })
    parts.push({ text: chars.slice(matchStart, matchEnd).join(''), match: true })
    start = matchEnd
    from = haystack.indexOf(needle, from + needle.length)
  }
  if (start < chars.length) parts.push({ text: chars.slice(start).join(''), match: false })
  return parts
}
