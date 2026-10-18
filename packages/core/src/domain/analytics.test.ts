import { describe, expect, it } from 'vitest'
import {
  bucketCount,
  isComplete,
  sanitizeBuckets,
  summarizeViews,
  timelineKey,
  type View,
} from './analytics'

const NOW = new Date('2026-10-18T10:00:00Z')
const view = (id: string, buckets: number, extra: Partial<View> = {}): View => ({
  id,
  videoId: 'v',
  viewerId: null,
  anonymousId: null,
  timelineKey: 'full',
  buckets,
  watchedMs: 0,
  startedAt: NOW,
  lastSeenAt: NOW,
  ...extra,
})
const first = (n: number) => (1 << n) - 1

describe('analytics', () => {
  it('handles bucket masks', () => {
    expect(sanitizeBuckets(first(25))).toBe(first(20))
    expect(sanitizeBuckets(-3)).toBe(0)
    expect(sanitizeBuckets(1.5)).toBe(0)
    expect(bucketCount(0b1011)).toBe(3)
    expect(isComplete({ buckets: first(19) })).toBe(true)
    expect(isComplete({ buckets: first(18) })).toBe(false)
    expect(timelineKey(null)).toBe('full')
    expect(timelineKey({ startMs: 1, endMs: 9 })).toBe('1-9')
  })

  it('summarizes views, viewers and retention for the current trim', () => {
    const later = new Date(NOW.getTime() + 60_000)
    const stats = summarizeViews(
      [
        view('1', first(20), { viewerId: 'u1' }),
        view('2', first(10), { viewerId: 'u1', lastSeenAt: later }),
        view('3', first(10), { anonymousId: 'a1' }),
        view('4', first(5), { anonymousId: 'a1' }),
        view('5', first(20), { timelineKey: 'old' }),
      ],
      'full',
      new Map([['u1', 'Ana']]),
    )
    expect(stats).toMatchObject({
      views: 5,
      uniqueViewers: 3,
      completionRate: 0.4,
      anonymousViews: 3,
      viewers: [{ viewerId: 'u1', name: 'Ana', views: 2, watched: 1, lastSeenAt: later }],
    })
    expect(stats.averageWatched).toBeCloseTo((1 + 0.5 + 0.5 + 0.25 + 1) / 5)
    // Only the four views with the current trim count for retention.
    expect(stats.retention[0]).toBe(1)
    expect(stats.retention[7]).toBe(0.75)
    expect(stats.retention[19]).toBe(0.25)
  })

  it('is empty without views', () => {
    expect(summarizeViews([], 'full', new Map())).toMatchObject({
      views: 0,
      averageWatched: 0,
      completionRate: 0,
      retention: Array(20).fill(0),
    })
  })
})
