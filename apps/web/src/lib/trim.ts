/** Trim editing on the recording's own timeline (milliseconds). */
import type { TrimRange } from './video-summary'

/** Shortest video a trim may leave (the API enforces the same limit). */
export const MIN_TRIMMED_MS = 1000

/** Keeps a range inside the recording and at least MIN_TRIMMED_MS long, moving `edge`. */
export function constrainTrim(
  range: TrimRange,
  durationMs: number,
  edge: 'start' | 'end',
): TrimRange {
  const round = (value: number) => Math.round(value)
  if (edge === 'start') {
    const startMs = Math.min(Math.max(0, range.startMs), range.endMs - MIN_TRIMMED_MS)
    return { startMs: round(Math.max(0, startMs)), endMs: round(range.endMs) }
  }
  const endMs = Math.max(Math.min(durationMs, range.endMs), range.startMs + MIN_TRIMMED_MS)
  return { startMs: round(range.startMs), endMs: round(Math.min(durationMs, endMs)) }
}

/** The trim to send: null when it keeps the whole recording. */
export function trimToSave(range: TrimRange, durationMs: number): TrimRange | null {
  return range.startMs <= 0 && range.endMs >= durationMs ? null : range
}

/** m:ss.t — precise enough to place a cut. */
export function formatPrecise(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100))
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`
}
