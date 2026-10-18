/**
 * Views and retention. The player reports which twentieths of the (trimmed) video were
 * watched; retention only compares views made with the same trim, since a new trim moves
 * every moment of the video.
 */
import type { TrimRange } from './render'

export const RETENTION_BUCKETS = 20
const ALL_BUCKETS = (1 << RETENTION_BUCKETS) - 1
/** A view counts as complete once this many twentieths were watched (95%). */
const COMPLETE_BUCKETS = 19

export interface View {
  readonly id: string
  readonly videoId: string
  /** null for anonymous viewers. */
  readonly viewerId: string | null
  /** Random id from a cookie, to count unique anonymous viewers. */
  readonly anonymousId: string | null
  /** Which trim the buckets refer to (see `timelineKey`). */
  readonly timelineKey: string
  /** Bit i set: the i-th twentieth of the video was watched. */
  readonly buckets: number
  readonly watchedMs: number
  readonly startedAt: Date
  readonly lastSeenAt: Date
}

export function timelineKey(trim: TrimRange | null): string {
  return trim ? `${trim.startMs}-${trim.endMs}` : 'full'
}

/** Keeps only valid bucket bits. */
export function sanitizeBuckets(buckets: number): number {
  return Number.isInteger(buckets) && buckets > 0 ? buckets & ALL_BUCKETS : 0
}

export function bucketCount(buckets: number): number {
  let count = 0
  for (let rest = buckets & ALL_BUCKETS; rest; rest &= rest - 1) count += 1
  return count
}

export function isComplete(view: Pick<View, 'buckets'>): boolean {
  return bucketCount(view.buckets) >= COMPLETE_BUCKETS
}

export interface ViewerSummary {
  viewerId: string
  name: string
  views: number
  /** Share of the video watched in their best view, 0–1. */
  watched: number
  lastSeenAt: Date
}

export interface VideoStats {
  views: number
  uniqueViewers: number
  /** Average share watched per view, 0–1. */
  averageWatched: number
  /** Share of views that watched (almost) everything, 0–1. */
  completionRate: number
  /** For each twentieth: share of views (with the current trim) that watched it, 0–1. */
  retention: number[]
  viewers: ViewerSummary[]
  anonymousViews: number
}

/** Summarizes a video's views for its owner. */
export function summarizeViews(
  views: readonly View[],
  currentTimeline: string,
  names: ReadonlyMap<string, string>,
): VideoStats {
  const share = (view: View) => bucketCount(view.buckets) / RETENTION_BUCKETS
  const comparable = views.filter((v) => v.timelineKey === currentTimeline)
  const retention = Array.from({ length: RETENTION_BUCKETS }, (_, i) =>
    comparable.length === 0
      ? 0
      : comparable.filter((v) => v.buckets & (1 << i)).length / comparable.length,
  )

  const byViewer = new Map<string, ViewerSummary>()
  for (const view of views) {
    if (!view.viewerId) continue
    const current = byViewer.get(view.viewerId)
    byViewer.set(view.viewerId, {
      viewerId: view.viewerId,
      name: names.get(view.viewerId) ?? '',
      views: (current?.views ?? 0) + 1,
      watched: Math.max(current?.watched ?? 0, share(view)),
      lastSeenAt:
        current && current.lastSeenAt > view.lastSeenAt ? current.lastSeenAt : view.lastSeenAt,
    })
  }
  const unique = new Set(views.map((v) => v.viewerId ?? `anon:${v.anonymousId ?? v.id}`))

  return {
    views: views.length,
    uniqueViewers: unique.size,
    averageWatched: views.length ? views.reduce((sum, v) => sum + share(v), 0) / views.length : 0,
    completionRate: views.length ? views.filter(isComplete).length / views.length : 0,
    retention,
    viewers: [...byViewer.values()].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime()),
    anonymousViews: views.filter((v) => !v.viewerId).length,
  }
}
