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

/**
 * Each character folded for matching: lowercase, without accents ("Camión" → "camion"), and
 * with Greek final sigma as plain sigma. Search and highlighting share it, so they agree.
 */
function foldedChars(text: string): { original: string; folded: string }[] {
  return [...text.normalize('NFC')].map((original) => ({
    original,
    folded: original.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ'),
  }))
}

const fold = (text: string) =>
  foldedChars(text)
    .map((c) => c.folded)
    .join('')

/** Indices of segments containing the query (accent- and case-insensitive). */
export function searchSegments(segments: readonly TranscriptSegment[], query: string): number[] {
  const needle = fold(query.trim())
  if (!needle) return []
  return segments.flatMap((s, i) => (fold(s.text).includes(needle) ? [i] : []))
}

/** Splits text into parts, marking those that match the query, for highlighting. */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const chars = foldedChars(text)
  const needle = fold(query.trim())
  if (!needle) return [{ text: chars.map((c) => c.original).join(''), match: false }]

  // Where each character starts in the folded text, to map matches back to characters.
  const starts: number[] = []
  let offset = 0
  for (const c of chars) {
    starts.push(offset)
    offset += c.folded.length
  }
  const haystack = chars.map((c) => c.folded).join('')
  const charAt = (position: number) => {
    const index = starts.findIndex((start) => start >= position)
    return index === -1 ? chars.length : index
  }
  const slice = (from: number, to: number) =>
    chars
      .slice(from, to)
      .map((c) => c.original)
      .join('')

  const parts: { text: string; match: boolean }[] = []
  let done = 0
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    const from = charAt(at)
    const to = charAt(at + needle.length)
    if (from > done) parts.push({ text: slice(done, from), match: false })
    parts.push({ text: slice(from, to), match: true })
    done = to
  }
  if (done < chars.length) parts.push({ text: slice(done, chars.length), match: false })
  return parts
}
