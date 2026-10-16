/**
 * Pure helpers for the video player: mapping between the media timeline and what viewers
 * see (a trim hides the start and end of a raw recording), hover thumbnails and the `t`
 * start parameter.
 */
import type { ThumbnailSprite, TrimRange } from './video-summary'

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5] as const

/** The visible window of the media, in seconds. */
export interface VisibleWindow {
  start: number
  end: number
}

export function visibleWindow(skip: TrimRange | null, mediaDuration: number): VisibleWindow {
  const duration = Number.isFinite(mediaDuration) ? mediaDuration : 0
  if (!skip) return { start: 0, end: duration }
  const start = Math.min(skip.startMs / 1000, duration)
  return { start, end: Math.max(start, Math.min(skip.endMs / 1000, duration)) }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Media time → seconds into the visible window. */
export function toVisibleTime(mediaTime: number, window: VisibleWindow): number {
  return clamp(mediaTime - window.start, 0, window.end - window.start)
}

/** Seconds into the visible window → media time. */
export function toMediaTime(visibleTime: number, window: VisibleWindow): number {
  return window.start + clamp(visibleTime, 0, window.end - window.start)
}

/** Where the thumbnail for a moment sits inside the sprite image. */
export function spriteTile(sprite: Omit<ThumbnailSprite, 'url'>, seconds: number) {
  const index = clamp(Math.floor((seconds * 1000) / sprite.intervalMs), 0, sprite.count - 1)
  return {
    x: (index % sprite.columns) * sprite.tileWidth,
    y: Math.floor(index / sprite.columns) * sprite.tileHeight,
  }
}

/** Parses a start time like "90", "1:30", "1m30s" or "1h2m3s" into seconds (0 if invalid). */
export function parseStartTime(raw: string | null | undefined): number {
  if (!raw) return 0
  const value = raw.trim()
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value)
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(value)
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (units && value !== '') {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0)
  }
  return 0
}

/** Clock-style time for player controls: 0:07, 1:05, 1:02:03. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
