import { DomainError } from '../domain/errors'
import { playableSegments, type PlayableSegment } from '../domain/playlist'
import {
  canView,
  createVideo,
  segmentKey,
  validateSegmentUpload,
  type SegmentKind,
  type SegmentUploadRequest,
  type Video,
} from '../domain/video'
import type { WorkspaceRole } from '../domain/workspace'
import type {
  Clock,
  IdGenerator,
  ObjectStorage,
  VideoRepository,
  WorkspaceRepository,
} from '../ports'

const UPLOAD_URL_TTL_SECONDS = 10 * 60
const PLAYBACK_URL_TTL_SECONDS = 60 * 60
const RECORDING_ROLES: ReadonlySet<WorkspaceRole> = new Set(['owner', 'admin', 'member'])
const CONTENT_TYPES: Record<SegmentKind, string> = {
  init: 'video/mp4',
  media: 'video/iso.segment',
}

export interface RecordingDeps {
  videos: VideoRepository
  workspaces: WorkspaceRepository
  storage: ObjectStorage
  ids: IdGenerator
  clock: Clock
}

async function loadVideo(videos: VideoRepository, id: string): Promise<Video> {
  const video = await videos.findById(id)
  if (!video) throw new DomainError('video.not_found', 'Video not found.')
  return video
}

/** Loads a video the caller owns and that is still accepting segments. */
async function loadOwnRecording(deps: RecordingDeps, userId: string, videoId: string) {
  const video = await loadVideo(deps.videos, videoId)
  if (video.ownerId !== userId) {
    throw new DomainError('video.forbidden', 'Only the owner can upload to this video.')
  }
  if (video.status !== 'recording') {
    throw new DomainError('video.not_recording', 'This video is no longer recording.')
  }
  return video
}

/** Creates the video when recording starts, so its share link exists immediately. */
export class StartRecording {
  constructor(private readonly deps: RecordingDeps) {}

  async execute(input: { userId: string; workspaceId: string; title: string }): Promise<Video> {
    const role = await this.deps.workspaces.roleOf(input.workspaceId, input.userId)
    if (!role || !RECORDING_ROLES.has(role)) {
      throw new DomainError('workspace.forbidden', 'You cannot record in this workspace.')
    }
    const video = createVideo({
      id: this.deps.ids.next(),
      workspaceId: input.workspaceId,
      ownerId: input.userId,
      title: input.title,
      now: this.deps.clock.now(),
    })
    await this.deps.videos.create(video)
    return video
  }
}

export interface PreparedUpload {
  key: string
  url: string
  expiresAt: Date
}

export class PrepareSegmentUpload {
  constructor(private readonly deps: RecordingDeps) {}

  async execute(
    input: SegmentUploadRequest & { userId: string; videoId: string },
  ): Promise<PreparedUpload> {
    validateSegmentUpload(input)
    await loadOwnRecording(this.deps, input.userId, input.videoId)

    const key = segmentKey(input.videoId, input.kind, input.index)
    await this.deps.videos.upsertSegment({
      videoId: input.videoId,
      kind: input.kind,
      index: input.index,
      startMs: input.startMs,
      byteLength: input.byteLength,
      sha256: input.sha256,
      uploadedAt: null,
    })
    const upload = await this.deps.storage.presignPut(key, {
      byteLength: input.byteLength,
      sha256: input.sha256,
      contentType: CONTENT_TYPES[input.kind],
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    })
    return { key, ...upload }
  }
}

/** Verifies that the browser's upload landed in storage before the segment counts. */
export class ConfirmSegmentUpload {
  constructor(private readonly deps: RecordingDeps) {}

  async execute(input: {
    userId: string
    videoId: string
    kind: SegmentKind
    index: number
  }): Promise<void> {
    await loadOwnRecording(this.deps, input.userId, input.videoId)
    const segment = await this.deps.videos.findSegment(input.videoId, input.kind, input.index)
    if (!segment) throw new DomainError('video.segment_unknown', 'This segment was never prepared.')

    const stored = await this.deps.storage.head(segmentKey(input.videoId, input.kind, input.index))
    if (!stored || stored.byteLength !== segment.byteLength) {
      throw new DomainError('video.segment_not_uploaded', 'The segment is missing or incomplete.')
    }
    await this.deps.videos.markSegmentUploaded(
      input.videoId,
      input.kind,
      input.index,
      this.deps.clock.now(),
    )
  }
}

export class CompleteRecording {
  constructor(private readonly deps: RecordingDeps) {}

  async execute(input: {
    userId: string
    videoId: string
    durationMs: number
    segmentCount: number
  }): Promise<Video> {
    const video = await loadOwnRecording(this.deps, input.userId, input.videoId)
    const uploaded = (await this.deps.videos.listSegments(video.id)).filter((s) => s.uploadedAt)
    const hasInit = uploaded.some((s) => s.kind === 'init')
    const mediaIndexes = new Set(uploaded.filter((s) => s.kind === 'media').map((s) => s.index))
    const missing = Array.from({ length: input.segmentCount }, (_, i) => i).filter(
      (i) => !mediaIndexes.has(i),
    )

    if (!hasInit || input.segmentCount < 1 || missing.length > 0) {
      const detail = [!hasInit ? 'init' : null, ...missing.map(String)].filter(Boolean).join(', ')
      throw new DomainError(
        'video.segments_missing',
        `Cannot complete: missing segments (${detail || 'none recorded'}).`,
      )
    }

    const completed: Video = {
      ...video,
      status: 'ready',
      durationMs: Math.max(0, Math.round(input.durationMs)),
      completedAt: this.deps.clock.now(),
    }
    await this.deps.videos.update(completed)
    return completed
  }
}

export interface Playback {
  video: Video
  ended: boolean
  segments: PlayableSegment[]
  /** Short-lived URL for the init segment or a media segment. */
  mediaUrl(kind: SegmentKind, index: number): Promise<string>
}

export class GetPlayback {
  constructor(private readonly deps: RecordingDeps) {}

  async execute(input: { viewerId: string | null; videoId: string }): Promise<Playback> {
    const video = await loadVideo(this.deps.videos, input.videoId)
    const role = input.viewerId
      ? await this.deps.workspaces.roleOf(video.workspaceId, input.viewerId)
      : null
    // Hidden videos look missing, so their existence is not revealed.
    if (!canView(video, { userId: input.viewerId, role })) {
      throw new DomainError('video.not_found', 'Video not found.')
    }

    const media = (await this.deps.videos.listSegments(video.id)).filter(
      (s) => s.kind === 'media' && s.uploadedAt,
    )
    const ended = video.status === 'ready'
    return {
      video,
      ended,
      segments: playableSegments(media, { endedAtMs: ended ? video.durationMs : null }),
      mediaUrl: (kind, index) =>
        this.deps.storage.presignGet(segmentKey(video.id, kind, index), {
          expiresInSeconds: PLAYBACK_URL_TTL_SECONDS,
        }),
    }
  }
}
