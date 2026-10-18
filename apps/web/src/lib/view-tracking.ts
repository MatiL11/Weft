/**
 * Tracks what a viewer actually watches: which twentieths of the video played and for how
 * long. Seeking doesn't count as watching; only continuous playback does.
 */
export const RETENTION_BUCKETS = 20
/** A view starts counting after this much playback. */
export const VIEW_THRESHOLD_MS = 1000
/** Gaps bigger than this between ticks are seeks or stalls, not watching. */
const MAX_TICK_GAP_S = 1.5

export interface TrackerState {
  buckets: number
  watchedMs: number
}

export class ViewTracker {
  private state: TrackerState = { buckets: 0, watchedMs: 0 }
  private lastTime: number | null = null

  /** Called a few times per second with the playback position (seconds). */
  tick(time: number, duration: number, playing: boolean): void {
    if (!playing || !(duration > 0) || !Number.isFinite(time)) {
      this.lastTime = null
      return
    }
    const delta = this.lastTime === null ? 0 : time - this.lastTime
    this.lastTime = time
    // Normal playback moves forward a little each tick (faster at higher speeds).
    if (delta > 0 && delta <= MAX_TICK_GAP_S * 3) {
      this.state = { ...this.state, watchedMs: this.state.watchedMs + delta * 1000 }
    }
    const bucket = Math.min(
      RETENTION_BUCKETS - 1,
      Math.max(0, Math.floor((time / duration) * RETENTION_BUCKETS)),
    )
    this.state = { ...this.state, buckets: this.state.buckets | (1 << bucket) }
  }

  get snapshot(): TrackerState {
    return { buckets: this.state.buckets, watchedMs: Math.round(this.state.watchedMs) }
  }

  get countsAsView(): boolean {
    return this.state.watchedMs >= VIEW_THRESHOLD_MS
  }
}
