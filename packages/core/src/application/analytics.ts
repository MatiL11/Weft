import {
  sanitizeBuckets,
  summarizeViews,
  timelineKey,
  type View,
  type VideoStats,
} from '../domain/analytics'
import { DomainError } from '../domain/errors'
import { VIEW_EMAIL_WINDOW_SECONDS } from '../domain/notification'
import { visibleDurationMs } from '../domain/render'
import type {
  Clock,
  IdGenerator,
  NotificationQueue,
  UserDirectory,
  VideoAccessTokens,
  VideoRepository,
  ViewRepository,
  WorkspaceRepository,
} from '../ports'
import { loadViewableVideo, type PlaybackRequest } from './playback'
import { loadOwnVideo } from './recording'

export interface AnalyticsDeps {
  videos: VideoRepository
  workspaces: WorkspaceRepository
  accessTokens: VideoAccessTokens
  views: ViewRepository
  users: UserDirectory
  notifications: NotificationQueue
  ids: IdGenerator
  clock: Clock
}

/** How many recent views the owner's stats consider. */
const STATS_VIEW_LIMIT = 5000

/**
 * A viewer started watching (the player calls this after a second of playback). The owner's
 * own views don't count. Returns the view's id, for progress updates.
 */
export class StartView {
  constructor(private readonly deps: AnalyticsDeps) {}

  async execute(input: PlaybackRequest & { anonymousId: string | null }): Promise<string | null> {
    const video = await loadViewableVideo(this.deps, input)
    if (input.viewerId === video.ownerId) return null
    const now = this.deps.clock.now()
    const view: View = {
      id: this.deps.ids.next(),
      videoId: video.id,
      viewerId: input.viewerId,
      anonymousId: input.viewerId ? null : input.anonymousId,
      timelineKey: timelineKey(video.trim),
      buckets: 0,
      watchedMs: 0,
      startedAt: now,
      lastSeenAt: now,
    }
    await this.deps.views.create(view)
    if (input.viewerId) {
      try {
        await this.deps.notifications.notify(
          { kind: 'view', recipientId: video.ownerId, videoId: video.id, viewerId: input.viewerId },
          {
            dedupeKey: `view:${video.ownerId}:${video.id}:${input.viewerId}`,
            dedupeSeconds: VIEW_EMAIL_WINDOW_SECONDS,
          },
        )
      } catch {
        // Emails are a courtesy; the view still counts.
      }
    }
    return view.id
  }
}

/** Adds the parts watched since the last report (bit masks only grow). */
export class RecordViewProgress {
  constructor(private readonly deps: AnalyticsDeps) {}

  async execute(input: {
    videoId: string
    viewId: string
    buckets: number
    watchedMs: number
  }): Promise<void> {
    const [view, video] = await Promise.all([
      this.deps.views.findById(input.viewId),
      this.deps.videos.findById(input.videoId),
    ])
    if (!view || !video || view.videoId !== video.id) {
      throw new DomainError('view.not_found', 'View not found.')
    }
    // Watch time can exceed the length (rewatching), but not absurdly.
    const cap = (visibleDurationMs(video) ?? 0) * 10 || Number.MAX_SAFE_INTEGER
    await this.deps.views.update({
      ...view,
      buckets: view.buckets | sanitizeBuckets(input.buckets),
      watchedMs: Math.min(cap, Math.max(view.watchedMs, Math.round(input.watchedMs) || 0)),
      lastSeenAt: this.deps.clock.now(),
    })
  }
}

/** Views, viewers and retention of one of the caller's videos. */
export class GetVideoStats {
  constructor(private readonly deps: AnalyticsDeps) {}

  async execute(input: { userId: string; videoId: string }): Promise<VideoStats> {
    const video = await loadOwnVideo(this.deps.videos, input.userId, input.videoId)
    const views = await this.deps.views.listForVideo(video.id, { limit: STATS_VIEW_LIMIT })
    const viewerIds = [...new Set(views.flatMap((v) => (v.viewerId ? [v.viewerId] : [])))]
    const profiles = await Promise.all(viewerIds.map((id) => this.deps.users.findById(id)))
    const names = new Map(profiles.flatMap((p) => (p ? [[p.id, p.name] as const] : [])))
    return summarizeViews(views, timelineKey(video.trim), names)
  }
}
