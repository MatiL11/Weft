import { DomainError } from './errors'
import type { WorkspaceRole } from './workspace'

export type VideoStatus = 'recording' | 'ready'
/** link: anyone with the URL · workspace: members only · private: owner only. */
export type VideoPrivacy = 'link' | 'workspace' | 'private'
export type SegmentKind = 'init' | 'media'

export const VIDEO_TITLE_MAX_LENGTH = 120
/** Upper bounds that keep a single recording reasonable (~2 h at 4 s segments). */
export const MAX_MEDIA_SEGMENTS = 2000
export const MAX_SEGMENT_BYTES = 64 * 1024 * 1024
const SHA256_BASE64 = /^[A-Za-z0-9+/]{43}=$/

export interface Video {
  readonly id: string
  readonly workspaceId: string
  readonly ownerId: string
  readonly title: string
  readonly status: VideoStatus
  readonly privacy: VideoPrivacy
  readonly createdAt: Date
  readonly completedAt: Date | null
  readonly durationMs: number | null
}

export interface VideoSegment {
  readonly videoId: string
  readonly kind: SegmentKind
  /** Media segment number (0-based); always 0 for the init segment. */
  readonly index: number
  /** Start of the segment on the recording timeline. */
  readonly startMs: number
  readonly byteLength: number
  /** Base64 SHA-256 of the bytes; the storage rejects uploads that don't match. */
  readonly sha256: string
  readonly uploadedAt: Date | null
}

export interface CreateVideoProps {
  id: string
  workspaceId: string
  ownerId: string
  title: string
  now: Date
}

export function createVideo(props: CreateVideoProps): Video {
  const title = props.title.trim()
  if (title.length === 0 || title.length > VIDEO_TITLE_MAX_LENGTH) {
    throw new DomainError(
      'video.title_invalid',
      `Video title must be between 1 and ${VIDEO_TITLE_MAX_LENGTH} characters.`,
    )
  }
  return {
    id: props.id,
    workspaceId: props.workspaceId,
    ownerId: props.ownerId,
    title,
    status: 'recording',
    privacy: 'link',
    createdAt: props.now,
    completedAt: null,
    durationMs: null,
  }
}

export interface SegmentUploadRequest {
  kind: SegmentKind
  index: number
  startMs: number
  byteLength: number
  sha256: string
}

export function validateSegmentUpload(request: SegmentUploadRequest): void {
  if (request.kind !== 'init' && request.kind !== 'media') {
    throw new DomainError('video.segment_kind_invalid', 'Segment kind must be "init" or "media".')
  }
  const maxIndex = request.kind === 'init' ? 0 : MAX_MEDIA_SEGMENTS - 1
  if (!Number.isInteger(request.index) || request.index < 0 || request.index > maxIndex) {
    throw new DomainError('video.segment_index_invalid', `Segment index must be 0…${maxIndex}.`)
  }
  if (!Number.isFinite(request.startMs) || request.startMs < 0) {
    throw new DomainError('video.segment_start_invalid', 'Segment start must be ≥ 0 ms.')
  }
  if (
    !Number.isInteger(request.byteLength) ||
    request.byteLength <= 0 ||
    request.byteLength > MAX_SEGMENT_BYTES
  ) {
    throw new DomainError(
      'video.segment_size_invalid',
      `Segment size must be 1…${MAX_SEGMENT_BYTES} bytes.`,
    )
  }
  if (!SHA256_BASE64.test(request.sha256)) {
    throw new DomainError(
      'video.segment_checksum_invalid',
      'sha256 must be a base64 SHA-256 digest.',
    )
  }
}

/** Object-storage key for a segment. */
export function segmentKey(videoId: string, kind: SegmentKind, index: number): string {
  return kind === 'init'
    ? `videos/${videoId}/init.mp4`
    : `videos/${videoId}/seg-${String(index).padStart(6, '0')}.m4s`
}

export interface Viewer {
  userId: string | null
  /** The viewer's role in the video's workspace, if any. */
  role: WorkspaceRole | null
}

export function canView(video: Video, viewer: Viewer): boolean {
  switch (video.privacy) {
    case 'link':
      return true
    case 'workspace':
      return viewer.role !== null
    case 'private':
      return viewer.userId === video.ownerId
  }
}
