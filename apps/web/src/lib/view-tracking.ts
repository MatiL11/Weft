/**
 * Tracks what a viewer actually watches: which twentieths of the video played and for how
 * long. Seeking doesn't count as watching; only continuous playback does.
 */
export const RETENTION_BUCKETS = 20
/** A view starts counting after this much playback. */
export const VIEW_THRESHOLD_MS = 1000
/**
 * The player reports every quarter second of position, so normal playback (at any speed)
 * moves a little between reports; bigger jumps are seeks, not watching.
 */
const MAX_TICK_GAP_S = 1

export interface TrackerState {
  buckets: number
  watchedMs: number
}

const bucketAt = (time: number, duration: number) =>
  Math.min(RETENTION_BUCKETS - 1, Math.max(0, Math.floor((time / duration) * RETENTION_BUCKETS)))

export class ViewTracker {
  private state: TrackerState = { buckets: 0, watchedMs: 0 }
  private lastTime: number | null = null

  /** Called a few times per second with the playback position (seconds). */
  tick(time: number, duration: number, playing: boolean): void {
    if (!playing || !(duration > 0) || !Number.isFinite(time)) {
      this.lastTime = null
      return
    }
    const previous = this.lastTime
    this.lastTime = time
    const delta = previous === null ? 0 : time - previous
    if (previous === null || delta <= 0 || delta > MAX_TICK_GAP_S) return
    // Every twentieth between the two reports was watched (short videos skip some).
    let buckets = this.state.buckets
    for (let b = bucketAt(previous, duration); b <= bucketAt(time, duration); b++) {
      buckets |= 1 << b
    }
    this.state = { buckets, watchedMs: this.state.watchedMs + delta * 1000 }
  }

  get snapshot(): TrackerState {
    return { buckets: this.state.buckets, watchedMs: Math.round(this.state.watchedMs) }
  }

  get countsAsView(): boolean {
    return this.state.watchedMs >= VIEW_THRESHOLD_MS
  }
}
