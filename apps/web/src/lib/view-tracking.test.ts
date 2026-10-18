import { describe, expect, it } from 'vitest'
import { ViewTracker } from './view-tracking'

describe('ViewTracker', () => {
  it('marks the twentieths that play and accumulates watch time', () => {
    const tracker = new ViewTracker()
    for (let t = 0; t <= 2; t += 0.25) tracker.tick(t, 20, true)
    expect(tracker.snapshot).toEqual({ buckets: 0b111, watchedMs: 2000 })
    expect(tracker.countsAsView).toBe(true)
  })

  it("doesn't count seeks, pauses or the time before the first tick", () => {
    const tracker = new ViewTracker()
    tracker.tick(0, 20, true)
    tracker.tick(0.25, 20, true)
    tracker.tick(15, 20, true) // a seek forward: bucket 15 marked, no watch time
    tracker.tick(15.25, 20, false) // paused
    tracker.tick(16, 20, true) // resumed: no time for the pause
    expect(tracker.snapshot.watchedMs).toBe(250)
    expect(tracker.countsAsView).toBe(false)
    expect(tracker.snapshot.buckets).toBe((1 << 0) | (1 << 15) | (1 << 16))
  })

  it('ignores unknown durations and clamps to the last bucket', () => {
    const tracker = new ViewTracker()
    tracker.tick(5, Number.NaN, true)
    tracker.tick(5, 0, true)
    expect(tracker.snapshot.buckets).toBe(0)
    tracker.tick(20, 20, true)
    expect(tracker.snapshot.buckets).toBe(1 << 19)
  })
})
