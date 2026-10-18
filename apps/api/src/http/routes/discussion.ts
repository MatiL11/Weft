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
import { accessCookieName, clientOf } from './playback'

export interface DiscussionRouteDeps {
  authorizeViewer: AuthorizeViewer
  getDiscussion: GetDiscussion
  addComment: AddComment
  editComment: EditComment
  deleteComment: DeleteComment
  addReaction: AddReaction
  /** Limits reactions per client and video. */
  reactionLimiter: { tryHit(key: string): boolean }
  videoEvents: {
    subscribe(videoId: string, listener: (event: VideoEvent) => void): Promise<() => void>
  }
  /** How often idle event streams send a keep-alive. */
  heartbeatMs?: number
}

const CommentBody = z.object({
  body: z.string().max(10_000),
  timestampMs: z.number().nonnegative().nullable().optional(),
  parentId: z.string().min(1).max(64).nullable().optional(),
})
const EditBody = z.object({ body: z.string().max(10_000) })
const ReactionBody = z.object({ emoji: z.string().max(16), timestampMs: z.number().nonnegative() })

const DEFAULT_HEARTBEAT_MS = 25_000

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
    if (!deps.reactionLimiter.tryHit(`${clientOf(c)} ${request.videoId}`)) {
      return c.json(fail('reaction.too_many', 'Slow down a little.'), 429)
    }
    const reaction = await deps.addReaction.execute({ ...request, ...body })
    const video = await deps.authorizeViewer.execute(request)
    return c.json(ok(presentReaction(reaction, video)), 201)
  })

  // Server-sent events: new, edited and deleted comments and new reactions, as they happen.
  routes.get('/:id/events', async (c) => {
    const video = await deps.authorizeViewer.execute(viewer(c))
    const response = streamSSE(c, async (stream) => {
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
      await stream.writeSSE({ event: 'ready', data: '{}' })
      const heartbeat = setInterval(
        () => void stream.write(': keep-alive\n\n'),
        deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
      )
      await new Promise<void>((resolve) => stream.onAbort(resolve))
      clearInterval(heartbeat)
      unsubscribe()
    })
    // Proxies must neither compress nor buffer the stream, or events would arrive late.
    response.headers.set('cache-control', 'no-cache, no-transform')
    response.headers.set('x-accel-buffering', 'no')
    return response
  })

  return routes
}
