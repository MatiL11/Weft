/**
 * Comments and reactions on a video. Their timestamps are kept on the original recording's
 * timeline, so they stay on the same moment when the owner changes the trim.
 */
import { DomainError } from './errors'
import type { TrimRange } from './render'

export const COMMENT_MAX_LENGTH = 2000
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '👏', '🔥', '🤔'] as const
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

export interface Comment {
  readonly id: string
  readonly videoId: string
  readonly authorId: string
  /** Replies point at a top-level comment; threads are one level deep. */
  readonly parentId: string | null
  /** Moment on the recording; null for replies and comments on the video as a whole. */
  readonly timestampMs: number | null
  readonly body: string
  readonly createdAt: Date
  readonly editedAt: Date | null
  /** Deleted comments keep their place in a thread but lose their text. */
  readonly deletedAt: Date | null
}

export interface CommentAuthor {
  readonly id: string
  readonly name: string
}

export interface CommentWithAuthor extends Comment {
  readonly author: CommentAuthor
}

export interface Reaction {
  readonly id: string
  readonly videoId: string
  /** null for anonymous viewers. */
  readonly userId: string | null
  readonly emoji: ReactionEmoji
  /** Moment on the recording. */
  readonly timestampMs: number
  readonly createdAt: Date
}

export function normalizeCommentBody(raw: string): string {
  const body = raw.replace(/\r\n?/g, '\n').trim()
  if (body.length === 0 || body.length > COMMENT_MAX_LENGTH) {
    throw new DomainError(
      'comment.body_invalid',
      `Comments must be between 1 and ${COMMENT_MAX_LENGTH} characters.`,
    )
  }
  return body
}

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value)
}

interface Timeline {
  trim: TrimRange | null
  durationMs: number | null
}

/** A moment viewers see (trimmed timeline) → the same moment on the recording. */
export function toRecordingMs(video: Timeline, visibleMs: number): number {
  const start = video.trim?.startMs ?? 0
  const end = video.trim?.endMs ?? video.durationMs ?? Number.POSITIVE_INFINITY
  const recordingMs = start + Math.round(visibleMs)
  if (!Number.isFinite(visibleMs) || visibleMs < 0 || recordingMs > end) {
    throw new DomainError('comment.timestamp_invalid', 'The timestamp is outside the video.')
  }
  return recordingMs
}

/** A moment on the recording → where viewers see it, or null if the trim cut it out. */
export function toVisibleMs(video: Timeline, recordingMs: number): number | null {
  const start = video.trim?.startMs ?? 0
  const end = video.trim?.endMs ?? Number.POSITIVE_INFINITY
  return recordingMs < start || recordingMs > end ? null : recordingMs - start
}
