import {
  buildMediaPlaylist,
  DomainError,
  MAX_MEDIA_SEGMENTS,
  type CompleteRecording,
  type ConfirmSegmentUpload,
  type GetPlayback,
  type PrepareSegmentUpload,
  type StartRecording,
  type Video,
  type WorkspaceRepository,
} from '@weft/core'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { currentUser, requireUser, type AppEnv } from '../context'
import { fail, ok } from '../envelope'

export interface VideoRouteDeps {
  workspaces: WorkspaceRepository
  startRecording: StartRecording
  prepareSegmentUpload: PrepareSegmentUpload
  confirmSegmentUpload: ConfirmSegmentUpload
  completeRecording: CompleteRecording
  getPlayback: GetPlayback
  /** Public base URL of the web app, used to build share links. */
  publicUrl: string
}

const SegmentKind = z.enum(['init', 'media'])
const StartBody = z.object({ title: z.string(), workspaceId: z.string().min(1).optional() })
const SegmentBody = z.object({
  kind: SegmentKind,
  index: z.number().int(),
  startMs: z.number().int().nonnegative(),
  byteLength: z.number().int(),
  sha256: z.string(),
})
const ConfirmBody = z.object({ kind: SegmentKind, index: z.number().int() })
const CompleteBody = z.object({
  durationMs: z.number().int().nonnegative(),
  segmentCount: z.number().int().nonnegative().max(MAX_MEDIA_SEGMENTS),
})

/** Presigned media URLs live for an hour; redirects may be cached for a few minutes. */
const MEDIA_REDIRECT_CACHE = 'private, max-age=300'

async function parse<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | null> {
  const result = schema.safeParse(await c.req.json().catch(() => null))
  return result.success ? result.data : null
}

const invalid = (c: Context) => c.json(fail('validation_error', 'Invalid request body.'), 400)

export function shareUrl(publicUrl: string, videoId: string): string {
  return `${publicUrl.replace(/\/$/, '')}/v/${videoId}`
}

function videoSummary(video: Video, viewerId: string | null) {
  return {
    id: video.id,
    title: video.title,
    status: video.status,
    privacy: video.privacy,
    durationMs: video.durationMs,
    createdAt: video.createdAt,
    isOwner: viewerId === video.ownerId,
  }
}

export function videoRoutes(deps: VideoRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  // ── Owner: recording and uploading ──
  routes.post('/', requireUser, async (c) => {
    const body = await parse(c, StartBody)
    if (!body) return invalid(c)
    const userId = currentUser(c.get('user')).id
    // Default to the user's first (personal) workspace.
    const workspaceId =
      body.workspaceId ?? (await deps.workspaces.listForUser(userId))[0]?.workspace.id
    if (!workspaceId) throw new DomainError('workspace.forbidden', 'You have no workspace.')

    const video = await deps.startRecording.execute({ userId, workspaceId, title: body.title })
    return c.json(
      ok({ video: videoSummary(video, userId), shareUrl: shareUrl(deps.publicUrl, video.id) }),
      201,
    )
  })

  routes.post('/:id/segments', requireUser, async (c) => {
    const body = await parse(c, SegmentBody)
    if (!body) return invalid(c)
    const prepared = await deps.prepareSegmentUpload.execute({
      ...body,
      userId: currentUser(c.get('user')).id,
      videoId: c.req.param('id'),
    })
    return c.json(ok({ url: prepared.url, expiresAt: prepared.expiresAt }))
  })

  routes.post('/:id/segments/confirm', requireUser, async (c) => {
    const body = await parse(c, ConfirmBody)
    if (!body) return invalid(c)
    await deps.confirmSegmentUpload.execute({
      ...body,
      userId: currentUser(c.get('user')).id,
      videoId: c.req.param('id'),
    })
    return c.json(ok({ confirmed: true }))
  })

  routes.post('/:id/complete', requireUser, async (c) => {
    const body = await parse(c, CompleteBody)
    if (!body) return invalid(c)
    const userId = currentUser(c.get('user')).id
    const video = await deps.completeRecording.execute({
      ...body,
      userId,
      videoId: c.req.param('id'),
    })
    return c.json(ok(videoSummary(video, userId)))
  })

  // ── Viewers (anonymous allowed; privacy enforced by GetPlayback) ──
  const playback = (c: Context<AppEnv>) =>
    deps.getPlayback.execute({
      viewerId: c.get('user')?.id ?? null,
      videoId: c.req.param('id') ?? '',
    })

  routes.get('/:id', async (c) => {
    const result = await playback(c)
    return c.json(ok(videoSummary(result.video, c.get('user')?.id ?? null)))
  })

  routes.get('/:id/playlist.m3u8', async (c) => {
    const result = await playback(c)
    const body = buildMediaPlaylist({
      initUri: 'media/init',
      segmentUri: (index) => `media/${index}`,
      segments: result.segments,
      ended: result.ended,
    })
    return c.body(body, 200, {
      'content-type': 'application/vnd.apple.mpegurl',
      // Live playlists change every few seconds; finished ones are stable.
      'cache-control': result.ended ? 'private, max-age=60' : 'no-store',
    })
  })

  routes.get('/:id/media/:segment', async (c) => {
    const segment = c.req.param('segment')
    const isInit = segment === 'init'
    const index = Number(segment)
    if (!isInit && !(Number.isInteger(index) && index >= 0)) {
      return c.json(fail('validation_error', 'Unknown media segment.'), 400)
    }
    const result = await playback(c)
    const url = await result.mediaUrl(isInit ? 'init' : 'media', isInit ? 0 : index)
    c.header('cache-control', MEDIA_REDIRECT_CACHE)
    return c.redirect(url, 302)
  })

  return routes
}
