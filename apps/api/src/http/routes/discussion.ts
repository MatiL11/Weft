import type {
  AddComment,
  AddReaction,
  AuthorizeViewer,
  DeleteComment,
  EditComment,
  GetDiscussion,
  VideoEvent,
} from '@weft/core'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { fail, ok } from '../envelope'
import { presentComment, presentReaction } from '../presenters'
import { invalid, parseJson } from '../validation'
import { accessCookieName } from './playback'

export interface DiscussionRouteDeps {
  authorizeViewer: AuthorizeViewer
  getDiscussion: GetDiscussion
  addComment: AddComment
  editComment: EditComment
  deleteComment: DeleteComment
  addReaction: AddReaction
  /** Limits reactions per viewer (account or address) and video. */
  reactionLimiter: { tryHit(key: string): boolean }
  /** Limits comments per account. */
  commentLimiter: { tryHit(key: string): boolean }
  videoEvents: {
    subscribe(videoId: string, listener: (event: VideoEvent) => void): Promise<() => void>
  }
  /** How often event streams send a keep-alive and re-check access. */
  heartbeatMs?: number
  /** Longest an event stream stays open. */
  maxStreamMs?: number
}

/** Recordings are capped well below a day; this keeps timestamps within the database's range. */
const MAX_TIMESTAMP_MS = 24 * 60 * 60 * 1000

const CommentBody = z.object({
  body: z.string().max(10_000),
  timestampMs: z.number().nonnegative().max(MAX_TIMESTAMP_MS).nullable().optional(),
  parentId: z.string().min(1).max(64).nullable().optional(),
})
const EditBody = z.object({ body: z.string().max(10_000) })
const ReactionBody = z.object({
  emoji: z.string().max(16),
  timestampMs: z.number().nonnegative().max(MAX_TIMESTAMP_MS),
})

const DEFAULT_HEARTBEAT_MS = 25_000
/** Streams are closed after this long; the browser reconnects on its own. */
const MAX_STREAM_MS = 30 * 60 * 1000

/** Comments, reactions and their live updates. Privacy is enforced by the use cases. */
export function discussionRoutes(deps: DiscussionRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  const viewer = (c: Context<AppEnv>) => {
    const videoId = c.req.param('id') ?? ''
    return {
      viewerId: c.get('user')?.id ?? null,
      videoId,
      accessToken: getCookie(c, accessCookieName(videoId)) ?? null,
    }
  }

  routes.get('/:id/discussion', async (c) => {
    const request = viewer(c)
    const { video, comments, reactions } = await deps.getDiscussion.execute(request)
    return c.json(
      ok({
        viewerId: request.viewerId,
        canModerate: request.viewerId === video.ownerId,
        comments: comments.map((comment) => presentComment(comment, video)),
        reactions: reactions.map((reaction) => presentReaction(reaction, video)),
      }),
    )
  })

  routes.post('/:id/comments', async (c) => {
    const body = await parseJson(c, CommentBody)
    if (!body) return invalid(c)
    const request = viewer(c)
    if (request.viewerId && !deps.commentLimiter.tryHit(request.viewerId)) {
      return c.json(fail('comment.too_many', 'Slow down a little.'), 429)
    }
    const comment = await deps.addComment.execute({ ...request, ...body })
    const video = await deps.authorizeViewer.execute(request)
    return c.json(ok(presentComment(comment, video)), 201)
  })

  routes.patch('/:id/comments/:commentId', async (c) => {
    const body = await parseJson(c, EditBody)
    if (!body) return invalid(c)
    const request = viewer(c)
    const comment = await deps.editComment.execute({
      ...request,
      commentId: c.req.param('commentId'),
      body: body.body,
    })
    const video = await deps.authorizeViewer.execute(request)
    return c.json(ok(presentComment(comment, video)))
  })

  routes.delete('/:id/comments/:commentId', async (c) => {
    await deps.deleteComment.execute({ ...viewer(c), commentId: c.req.param('commentId') })
    return c.json(ok({ deleted: true }))
  })

  routes.post('/:id/reactions', async (c) => {
    const body = await parseJson(c, ReactionBody)
    if (!body) return invalid(c)
    const request = viewer(c)
    const who = request.viewerId ?? c.get('clientIp')
    if (!deps.reactionLimiter.tryHit(`${who} ${request.videoId}`)) {
      return c.json(fail('reaction.too_many', 'Slow down a little.'), 429)
    }
    const reaction = await deps.addReaction.execute({ ...request, ...body })
    const video = await deps.authorizeViewer.execute(request)
    return c.json(ok(presentReaction(reaction, video)), 201)
  })

  // Server-sent events: new, edited and deleted comments and new reactions, as they happen.
  // Access is checked again on every heartbeat, so people who lose access stop receiving
  // events, and streams end after a while (browsers reconnect, checking access anew).
  routes.get('/:id/events', async (c) => {
    const request = viewer(c)
    let video = await deps.authorizeViewer.execute(request)
    const response = streamSSE(c, async (stream) => {
      const ended = new Promise<void>((resolve) => stream.onAbort(resolve))
      if (stream.aborted) return
      const send = (event: VideoEvent) => {
        const data =
          event.type === 'comment.deleted'
            ? { commentId: event.commentId }
            : event.type === 'reaction.created'
              ? presentReaction(event.reaction, video)
              : presentComment(event.comment, video)
        void stream.writeSSE({ event: event.type, data: JSON.stringify(data) })
      }
      const unsubscribe = await deps.videoEvents.subscribe(video.id, send)
      const heartbeat = setInterval(() => {
        deps.authorizeViewer
          .execute(request)
          .then((current) => {
            // Picks up trims and privacy changes for later events.
            video = current
            return stream.write(': keep-alive\n\n')
          })
          .catch(() => stream.abort())
      }, deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS)
      const lifetime = setTimeout(() => stream.abort(), deps.maxStreamMs ?? MAX_STREAM_MS)
      try {
        if (!stream.aborted) await stream.writeSSE({ event: 'ready', data: '{}' })
        await ended
      } finally {
        clearInterval(heartbeat)
        clearTimeout(lifetime)
        unsubscribe()
      }
    })
    // Proxies must neither compress nor buffer the stream, or events would arrive late.
    response.headers.set('cache-control', 'no-cache, no-transform')
    response.headers.set('x-accel-buffering', 'no')
    return response
  })

  return routes
}
