import { DomainError } from '../domain/errors'
import { playableSegments, type PlayableSegment } from '../domain/playlist'
import {
  isRenderAsset,
  playbackSource,
  renderPrefix,
  trimmedTimeline,
  type PlaybackSource,
  type TrimRange,
} from '../domain/render'
import { accessFor, segmentKey, type SegmentKind, type Video } from '../domain/video'
import type {
  ObjectStorage,
  PasswordHasher,
  VideoAccessTokens,
  VideoRepository,
  WorkspaceRepository,
} from '../ports'
import { loadVideo } from './recording'

const PLAYBACK_URL_TTL_SECONDS = 60 * 60

export interface PlaybackDeps {
  videos: VideoRepository
  workspaces: WorkspaceRepository
  storage: ObjectStorage
  accessTokens: VideoAccessTokens
}

export interface Playback {
  video: Video
  isOwner: boolean
  ended: boolean
  source: PlaybackSource
  /** Raw segments with known durations (used when the source is raw), minus trimmed ones. */
  segments: PlayableSegment[]
  /** Trim still to hide while playing `segments`, relative to the first of them. */
  skip: TrimRange | null
  /** Short-lived URL for a raw init or media segment. */
  mediaUrl(kind: SegmentKind, index: number): Promise<string>
  /** Short-lived URL for a file of the latest render (poster, sprite, MP4, HLS media). */
  assetUrl(path: string, options?: { downloadFilename?: string }): Promise<string>
  /** Contents of a render playlist. */
  readAsset(path: string): Promise<string>
}

export interface PlaybackRequest {
  viewerId: string | null
  videoId: string
  /** Token from a successful UnlockVideo, for password-protected videos. */
  accessToken?: string | null
}

export class GetPlayback {
  constructor(private readonly deps: PlaybackDeps) {}

  async execute(input: PlaybackRequest): Promise<Playback> {
    const { videos, workspaces, storage, accessTokens } = this.deps
    const video = await loadVideo(videos, input.videoId)
    const role = input.viewerId ? await workspaces.roleOf(video.workspaceId, input.viewerId) : null
    const unlocked = !!input.accessToken && accessTokens.verify(video, input.accessToken)
    const access = accessFor(video, { userId: input.viewerId, role, unlocked })
    if (access === 'password_required') {
      throw new DomainError('video.password_required', 'This video is password protected.')
    }
    // Hidden videos look missing, so their existence is not revealed.
    if (access === 'hidden') throw new DomainError('video.not_found', 'Video not found.')

    const media = (await videos.listSegments(video.id)).filter(
      (s) => s.kind === 'media' && s.uploadedAt,
    )
    const ended = video.status === 'ready'
    const isOwner = input.viewerId === video.ownerId
    const source = playbackSource(video)
    const timeline = trimmedTimeline(
      playableSegments(media, { endedAtMs: ended ? video.durationMs : null }),
      source.kind === 'raw' ? source.skip : null,
    )
    const missing = () => new DomainError('asset.not_found', 'This file does not exist.')
    // Viewers only get what the current trim keeps: no raw media once a matching render
    // exists, and no renders made for an older trim. The owner can reach everything.
    const servedSegments = new Set(timeline.segments.map((s) => s.index))
    const canServeRaw = (kind: SegmentKind, index: number) =>
      isOwner || (source.kind === 'raw' && (kind === 'init' || servedSegments.has(index)))
    const assetKey = (path: string) => {
      if (!video.render || !isRenderAsset(path)) throw missing()
      if (!isOwner && source.kind !== 'render') throw missing()
      return `${renderPrefix(video.id, video.render.version)}${path}`
    }

    return {
      video,
      isOwner,
      ended,
      source,
      segments: timeline.segments,
      skip: timeline.skip,
      mediaUrl: async (kind, index) => {
        if (!canServeRaw(kind, index)) throw missing()
        return storage.presignGet(segmentKey(video.id, kind, index), {
          expiresInSeconds: PLAYBACK_URL_TTL_SECONDS,
        })
      },
      assetUrl: async (path, options) =>
        storage.presignGet(assetKey(path), {
          expiresInSeconds: PLAYBACK_URL_TTL_SECONDS,
          ...options,
        }),
      readAsset: async (path) => {
        const text = await storage.readText(assetKey(path))
        if (text === null) throw new DomainError('asset.not_found', 'This file does not exist.')
        return text
      },
    }
  }
}

const PASSWORD_MIN_LENGTH = 4
const PASSWORD_MAX_LENGTH = 128

export function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new DomainError(
      'video.password_invalid_length',
      `Passwords must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`,
    )
  }
}

/** Checks a viewer's password and returns a token proving they know it. */
export class UnlockVideo {
  constructor(
    private readonly deps: {
      videos: VideoRepository
      passwords: PasswordHasher
      accessTokens: VideoAccessTokens
    },
  ) {}

  async execute(input: { videoId: string; password: string }): Promise<string> {
    const video = await loadVideo(this.deps.videos, input.videoId)
    if (video.privacy !== 'password' || !video.passwordHash) {
      throw new DomainError('video.not_found', 'Video not found.')
    }
    if (!(await this.deps.passwords.verify(input.password, video.passwordHash))) {
      throw new DomainError('video.password_incorrect', 'Incorrect password.')
    }
    return this.deps.accessTokens.issue(video)
  }
}
