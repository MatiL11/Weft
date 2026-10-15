import type { SegmentKind, Video, VideoSegment } from '../domain/video'
import type { Workspace, WorkspaceMembership, WorkspaceRole } from '../domain/workspace'

export interface Clock {
  now(): Date
}

export interface IdGenerator {
  next(): string
}

export interface WorkspaceRepository {
  slugExists(slug: string): Promise<boolean>
  /** Persists the workspace and the owner's membership atomically. */
  createWithMember(workspace: Workspace, userId: string, role: WorkspaceRole): Promise<void>
  listForUser(userId: string): Promise<WorkspaceMembership[]>
  /** The user's role in the workspace, or null if they are not a member. */
  roleOf(workspaceId: string, userId: string): Promise<WorkspaceRole | null>
}

export interface VideoRepository {
  create(video: Video): Promise<void>
  findById(id: string): Promise<Video | null>
  update(video: Video): Promise<void>
  /** Inserts or replaces the expected segment (re-preparing resets its upload state). */
  upsertSegment(segment: VideoSegment): Promise<void>
  findSegment(videoId: string, kind: SegmentKind, index: number): Promise<VideoSegment | null>
  markSegmentUploaded(videoId: string, kind: SegmentKind, index: number, at: Date): Promise<void>
  listSegments(videoId: string): Promise<VideoSegment[]>
  /** Deletes the video and its segment records. */
  delete(id: string): Promise<void>
}

export interface PresignedUpload {
  url: string
  expiresAt: Date
}

export interface ObjectStorage {
  /** URL that accepts exactly one PUT of `byteLength` bytes whose SHA-256 matches. */
  presignPut(
    key: string,
    options: { byteLength: number; sha256: string; contentType: string; expiresInSeconds: number },
  ): Promise<PresignedUpload>
  presignGet(key: string, options: { expiresInSeconds: number }): Promise<string>
  /** Size of a stored object, or null if it does not exist. */
  head(key: string): Promise<{ byteLength: number } | null>
  /** Deletes every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>
}
