import {
  isReactionEmoji,
  normalizeCommentBody,
  toRecordingMs,
  type Comment,
  type CommentWithAuthor,
  type Reaction,
} from '../domain/collaboration'
import { DomainError } from '../domain/errors'
import type { Video } from '../domain/video'
import type {
  Clock,
  CommentRepository,
  IdGenerator,
  ReactionRepository,
  VideoAccessTokens,
  VideoEventPublisher,
  VideoRepository,
  WorkspaceRepository,
} from '../ports'
import { loadViewableVideo, type PlaybackRequest } from './playback'

export interface CollaborationDeps {
  videos: VideoRepository
  workspaces: WorkspaceRepository
  accessTokens: VideoAccessTokens
  comments: CommentRepository
  reactions: ReactionRepository
  events: VideoEventPublisher
  ids: IdGenerator
  clock: Clock
}

/** How many reactions the timeline shows. */
const REACTION_LIST_LIMIT = 1000

export interface Discussion {
  video: Video
  comments: CommentWithAuthor[]
  reactions: Reaction[]
}

/** Checks that the viewer may watch the video (e.g. before streaming its live events). */
export class AuthorizeViewer {
  constructor(
    private readonly deps: Pick<CollaborationDeps, 'videos' | 'workspaces' | 'accessTokens'>,
  ) {}

  execute(input: PlaybackRequest): Promise<Video> {
    return loadViewableVideo(this.deps, input)
  }
}

/** Comments and reactions of a video, for anyone who can watch it. */
export class GetDiscussion {
  constructor(private readonly deps: CollaborationDeps) {}

  async execute(input: PlaybackRequest): Promise<Discussion> {
    const video = await loadViewableVideo(this.deps, input)
    const [comments, reactions] = await Promise.all([
      this.deps.comments.listForVideo(video.id),
      this.deps.reactions.listForVideo(video.id, { limit: REACTION_LIST_LIMIT }),
    ])
    return { video, comments, reactions }
  }
}

function requireSignedIn(viewerId: string | null): string {
  if (!viewerId) throw new DomainError('comment.sign_in_required', 'Sign in to comment.')
  return viewerId
}

async function loadComment(comments: CommentRepository, id: string, videoId: string) {
  const comment = await comments.findById(id)
  if (!comment || comment.videoId !== videoId) {
    throw new DomainError('comment.not_found', 'Comment not found.')
  }
  return comment
}

export class AddComment {
  constructor(private readonly deps: CollaborationDeps) {}

  async execute(
    input: PlaybackRequest & {
      body: string
      timestampMs?: number | null
      parentId?: string | null
    },
  ): Promise<CommentWithAuthor> {
    const authorId = requireSignedIn(input.viewerId)
    const video = await loadViewableVideo(this.deps, input)
    const body = normalizeCommentBody(input.body)

    let timestampMs: number | null = null
    if (input.parentId) {
      const parent = await loadComment(this.deps.comments, input.parentId, video.id)
      if (parent.parentId !== null || parent.deletedAt) {
        throw new DomainError('comment.reply_invalid', 'Replies go to existing top-level comments.')
      }
    } else if (input.timestampMs !== undefined && input.timestampMs !== null) {
      timestampMs = toRecordingMs(video, input.timestampMs)
    }

    const comment: Comment = {
      id: this.deps.ids.next(),
      videoId: video.id,
      authorId,
      parentId: input.parentId ?? null,
      timestampMs,
      body,
      createdAt: this.deps.clock.now(),
      editedAt: null,
      deletedAt: null,
    }
    await this.deps.comments.create(comment)
    const created = await loadComment(this.deps.comments, comment.id, video.id)
    await this.deps.events.publish({ type: 'comment.created', videoId: video.id, comment: created })
    return created
  }
}

/** Authors can fix their own comments. */
export class EditComment {
  constructor(private readonly deps: CollaborationDeps) {}

  async execute(
    input: PlaybackRequest & { commentId: string; body: string },
  ): Promise<CommentWithAuthor> {
    const viewerId = requireSignedIn(input.viewerId)
    const video = await loadViewableVideo(this.deps, input)
    const comment = await loadComment(this.deps.comments, input.commentId, video.id)
    if (comment.authorId !== viewerId || comment.deletedAt) {
      throw new DomainError('comment.forbidden', 'You can only edit your own comments.')
    }
    const { author: _author, ...fields } = comment
    await this.deps.comments.update({
      ...fields,
      body: normalizeCommentBody(input.body),
      editedAt: this.deps.clock.now(),
    })
    const updated = await loadComment(this.deps.comments, comment.id, video.id)
    await this.deps.events.publish({ type: 'comment.updated', videoId: video.id, comment: updated })
    return updated
  }
}

/** Authors delete their comments; the video's owner can delete any of them. */
export class DeleteComment {
  constructor(private readonly deps: CollaborationDeps) {}

  async execute(input: PlaybackRequest & { commentId: string }): Promise<void> {
    const viewerId = requireSignedIn(input.viewerId)
    const video = await loadViewableVideo(this.deps, input)
    const comment = await loadComment(this.deps.comments, input.commentId, video.id)
    if (comment.authorId !== viewerId && video.ownerId !== viewerId) {
      throw new DomainError('comment.forbidden', 'You cannot delete this comment.')
    }
    if (comment.deletedAt) return
    const { author: _author, ...fields } = comment
    await this.deps.comments.update({ ...fields, body: '', deletedAt: this.deps.clock.now() })
    await this.deps.events.publish({
      type: 'comment.deleted',
      videoId: video.id,
      commentId: comment.id,
    })
  }
}

/** Emoji reactions at a moment of the video; anyone who can watch may react. */
export class AddReaction {
  constructor(private readonly deps: CollaborationDeps) {}

  async execute(
    input: PlaybackRequest & { emoji: string; timestampMs: number },
  ): Promise<Reaction> {
    const video = await loadViewableVideo(this.deps, input)
    if (!isReactionEmoji(input.emoji)) {
      throw new DomainError('reaction.emoji_invalid', 'This reaction is not available.')
    }
    const reaction: Reaction = {
      id: this.deps.ids.next(),
      videoId: video.id,
      userId: input.viewerId,
      emoji: input.emoji,
      timestampMs: toRecordingMs(video, input.timestampMs),
      createdAt: this.deps.clock.now(),
    }
    await this.deps.reactions.create(reaction)
    await this.deps.events.publish({ type: 'reaction.created', videoId: video.id, reaction })
    return reaction
  }
}
