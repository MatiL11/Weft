import type { Comment, CommentWithAuthor, Reaction } from '../domain/collaboration'
import type { RenderOutput, RenderState, TrimRange, VideoRender } from '../domain/render'
import type {
  Transcript,
  TranscriptionState,
  TranscriptLanguage,
  TranscriptSegment,
} from '../domain/transcript'
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
  /** Newest first. */
  listForWorkspace(workspaceId: string, options: { limit: number }): Promise<Video[]>
  /**
   * Saves the owner-editable fields and recording status. Render and transcription progress
   * is left alone: it changes only through `requestRender`/`saveRender` and
   * `requestTranscription`/`saveTranscription`, so edits and background jobs never collide.
   */
  update(video: Video): Promise<void>
  /** Bumps the render version and marks it queued; returns the new version (null if gone). */
  requestRender(id: string): Promise<number | null>
  /**
   * Records progress of a render, only if `version` is still the latest requested one.
   * Returns false when the render is stale (or the video was deleted).
   */
  saveRender(
    id: string,
    version: number,
    update: { state: RenderState; render?: VideoRender },
  ): Promise<boolean>
  /** Bumps the transcription version and marks it queued; returns it (null if gone). */
  requestTranscription(id: string): Promise<number | null>
  /** Records transcription progress if `version` is still the latest; false when stale. */
  saveTranscription(id: string, version: number, state: TranscriptionState): Promise<boolean>
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
  /** Size of a stored object, or null if it does not exist. */
  head(key: string): Promise<{ byteLength: number } | null>
  presignGet(
    key: string,
    options: { expiresInSeconds: number; downloadFilename?: string },
  ): Promise<string>
  /** Contents of a small text object (e.g. a playlist), or null if it does not exist. */
  readText(key: string): Promise<string | null>
  /** Deletes every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>
}

export interface RenderJob {
  videoId: string
  version: number
}

/** Hands render jobs to background workers. */
export interface RenderQueue {
  enqueue(job: RenderJob): Promise<void>
}

/** Turns raw recording segments into the files of a render (implemented with ffmpeg). */
export interface MediaRenderer {
  render(input: {
    /** Init segment first, then media segments in order. */
    sourceKeys: string[]
    trim: TrimRange | null
    /** Where the render's files go (see `isRenderAsset` for their names). */
    outputPrefix: string
  }): Promise<RenderOutput>
}

export interface TranscriptionJob {
  videoId: string
  version: number
}

export interface TranscriptionQueue {
  enqueueTranscription(job: TranscriptionJob): Promise<void>
}

export interface TranscriptRepository {
  /** Replaces the video's transcript. */
  save(transcript: Transcript): Promise<void>
  find(videoId: string): Promise<Transcript | null>
}

/** Turns a stored video's speech into timed text (implemented with whisper.cpp). */
export interface SpeechRecognizer {
  /** null when the video has no sound to transcribe. */
  transcribe(input: {
    mediaKey: string
    language: TranscriptLanguage
  }): Promise<{ language: string; segments: TranscriptSegment[] } | null>
}

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, hash: string): Promise<boolean>
}

/**
 * Proof that a viewer entered a video's password. Tokens are bound to the current password,
 * so changing it locks everyone out again.
 */
export interface VideoAccessTokens {
  issue(video: Video): string
  verify(video: Video, token: string): boolean
}

export interface CommentRepository {
  create(comment: Comment): Promise<void>
  update(comment: Comment): Promise<void>
  findById(id: string): Promise<CommentWithAuthor | null>
  /** Oldest first. */
  listForVideo(videoId: string): Promise<CommentWithAuthor[]>
}

export interface ReactionRepository {
  create(reaction: Reaction): Promise<void>
  /** The most recent `limit` reactions, oldest first. */
  listForVideo(videoId: string, options: { limit: number }): Promise<Reaction[]>
}

/** Something happened on a video that people watching it should see right away. */
export type VideoEvent =
  | { type: 'comment.created' | 'comment.updated'; videoId: string; comment: CommentWithAuthor }
  | { type: 'comment.deleted'; videoId: string; commentId: string }
  | { type: 'reaction.created'; videoId: string; reaction: Reaction }

export interface VideoEventPublisher {
  publish(event: VideoEvent): Promise<void>
}
