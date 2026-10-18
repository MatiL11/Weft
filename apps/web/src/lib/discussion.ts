/** Comments and reactions on the client: live event handling, threads and timeline markers. */

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '👏', '🔥', '🤔'] as const

export interface CommentView {
  id: string
  parentId: string | null
  author: { id: string; name: string }
  body: string
  /** On the video's (trimmed) timeline; null if not tied to a moment. */
  timestampMs: number | null
  createdAt: string
  editedAt: string | null
  deleted: boolean
}

export interface ReactionView {
  id: string
  emoji: string
  timestampMs: number | null
  createdAt: string
}

export interface Discussion {
  viewerId: string | null
  canModerate: boolean
  comments: CommentView[]
  reactions: ReactionView[]
}

export type DiscussionEvent =
  | { type: 'comment.created' | 'comment.updated'; comment: CommentView }
  | { type: 'comment.deleted'; commentId: string }
  | { type: 'reaction.created'; reaction: ReactionView }

/** Applies a live event; repeated events (e.g. our own echo) change nothing. */
export function applyEvent(discussion: Discussion, event: DiscussionEvent): Discussion {
  switch (event.type) {
    case 'comment.created':
    case 'comment.updated': {
      const exists = discussion.comments.some((c) => c.id === event.comment.id)
      const comments = exists
        ? discussion.comments.map((c) => (c.id === event.comment.id ? event.comment : c))
        : [...discussion.comments, event.comment]
      return { ...discussion, comments }
    }
    case 'comment.deleted':
      return {
        ...discussion,
        comments: discussion.comments.map((c) =>
          c.id === event.commentId ? { ...c, body: '', deleted: true } : c,
        ),
      }
    case 'reaction.created':
      return discussion.reactions.some((r) => r.id === event.reaction.id)
        ? discussion
        : { ...discussion, reactions: [...discussion.reactions, event.reaction] }
  }
}

export interface Thread {
  comment: CommentView
  replies: CommentView[]
}

/**
 * Top-level comments with their replies, in conversation order. Deleted comments without
 * replies disappear; deleted ones with replies stay as placeholders.
 */
export function threads(comments: readonly CommentView[]): Thread[] {
  const replies = new Map<string, CommentView[]>()
  for (const comment of comments) {
    if (comment.parentId)
      replies.set(comment.parentId, [...(replies.get(comment.parentId) ?? []), comment])
  }
  return comments
    .filter((c) => c.parentId === null)
    .map((comment) => ({
      comment,
      replies: (replies.get(comment.id) ?? []).filter((r) => !r.deleted),
    }))
    .filter((thread) => !thread.comment.deleted || thread.replies.length > 0)
}

export interface TimelineMarker {
  /** 0–1 along the timeline. */
  position: number
  kind: 'comment' | 'reaction'
  /** An emoji, or the initial of the comment's author. */
  label: string
  count: number
}

/**
 * Markers for the seek bar. Nearby markers of the same kind merge into one with a count, so
 * a busy video stays readable.
 */
export function timelineMarkers(
  discussion: Pick<Discussion, 'comments' | 'reactions'>,
  durationMs: number,
  buckets = 60,
): TimelineMarker[] {
  if (!(durationMs > 0)) return []
  const byBucket = new Map<string, TimelineMarker>()
  const add = (ms: number | null, kind: TimelineMarker['kind'], label: string) => {
    if (ms === null || ms < 0 || ms > durationMs) return
    const bucket = Math.min(buckets - 1, Math.floor((ms / durationMs) * buckets))
    const key = `${kind}:${bucket}`
    const existing = byBucket.get(key)
    if (existing) byBucket.set(key, { ...existing, count: existing.count + 1 })
    else byBucket.set(key, { position: (bucket + 0.5) / buckets, kind, label, count: 1 })
  }
  for (const c of discussion.comments) {
    if (!c.deleted && c.parentId === null) add(c.timestampMs, 'comment', initialOf(c.author.name))
  }
  for (const r of discussion.reactions) add(r.timestampMs, 'reaction', r.emoji)
  return [...byBucket.values()].sort((a, b) => a.position - b.position)
}

export function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}
