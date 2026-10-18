import {
  DomainError,
  MAX_MEDIA_SEGMENTS,
  TRANSCRIPT_LANGUAGES,
  VIDEO_PRIVACIES,
  type CompleteRecording,
  type ConfirmSegmentUpload,
  type DeleteVideo,
  type ListVideos,
  type MoveVideo,
  type RestoreVideo,
  type TrashVideo,
  type PrepareSegmentUpload,
  type RequestRender,
  type RequestTranscription,
  type StartRecording,
  type UpdateVideo,
  type WorkspaceRepository,
} from '@weft/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { currentUser, requireUser, type AppEnv } from '../context'
import { ok } from '../envelope'
import { presentVideo, shareUrl } from '../presenters'
import { invalid, parseJson } from '../validation'

export interface VideoRouteDeps {
  workspaces: WorkspaceRepository
  startRecording: StartRecording
  prepareSegmentUpload: PrepareSegmentUpload
  confirmSegmentUpload: ConfirmSegmentUpload
  completeRecording: CompleteRecording
  deleteVideo: DeleteVideo
  updateVideo: UpdateVideo
  requestRender: RequestRender
  requestTranscription: RequestTranscription
  listVideos: ListVideos
  moveVideo: MoveVideo
  trashVideo: TrashVideo
  restoreVideo: RestoreVideo
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
const MoveBody = z.object({ folderId: z.string().min(1).max(64).nullable() })
const UpdateBody = z
  .object({
    title: z.string(),
    privacy: z.enum(VIDEO_PRIVACIES),
    password: z.string(),
    trim: z.object({ startMs: z.number().int(), endMs: z.number().int() }).nullable(),
    transcriptLanguage: z.enum(TRANSCRIPT_LANGUAGES),
  })
  .partial()

/** The caller's first (personal) workspace, used when a request names none. */
async function defaultWorkspaceId(workspaces: WorkspaceRepository, userId: string) {
  const id = (await workspaces.listForUser(userId))[0]?.workspace.id
  if (!id) throw new DomainError('workspace.forbidden', 'You have no workspace.')
  return id
}

/** Recording, uploading and managing one's videos. */
export function videoRoutes(deps: VideoRouteDeps): Hono<AppEnv> {
  // requireUser goes on each route: middleware on this sub-app would also cover the
  // anonymous playback routes mounted under the same prefix.
  const routes = new Hono<AppEnv>()
  const userId = (c: { get: (key: 'user') => AppEnv['Variables']['user'] }) =>
    currentUser(c.get('user')).id

  routes.get('/', requireUser, async (c) => {
    const user = userId(c)
    const workspaceId =
      c.req.query('workspaceId') ?? (await defaultWorkspaceId(deps.workspaces, user))
    const folder = c.req.query('folderId')
    const items = await deps.listVideos.execute({
      userId: user,
      workspaceId,
      // "root" lists the top level; no folderId lists every folder.
      folderId: folder === 'root' ? null : folder,
      search: c.req.query('q'),
      trashed: c.req.query('trash') === '1',
    })
    const views = items.map(({ video, match, viewCount }) => {
      const view = { ...presentVideo(video, user), match, viewCount }
      // Members still need the password to open others' protected videos, poster included.
      return video.privacy === 'password' && !view.isOwner
        ? { ...view, posterUrl: null, thumbnails: null, downloadUrl: null, match: null }
        : view
    })
    return c.json(ok(views))
  })

  routes.post('/', requireUser, async (c) => {
    const body = await parseJson(c, StartBody)
    if (!body) return invalid(c)
    const user = userId(c)
    const workspaceId = body.workspaceId ?? (await defaultWorkspaceId(deps.workspaces, user))
    const video = await deps.startRecording.execute({
      userId: user,
      workspaceId,
      title: body.title,
    })
    return c.json(
      ok({ video: presentVideo(video, user), shareUrl: shareUrl(deps.publicUrl, video.id) }),
      201,
    )
  })

  routes.post('/:id/segments', requireUser, async (c) => {
    const body = await parseJson(c, SegmentBody)
    if (!body) return invalid(c)
    const prepared = await deps.prepareSegmentUpload.execute({
      ...body,
      userId: userId(c),
      videoId: c.req.param('id'),
    })
    return c.json(ok({ url: prepared.url, expiresAt: prepared.expiresAt }))
  })

  routes.post('/:id/segments/confirm', requireUser, async (c) => {
    const body = await parseJson(c, ConfirmBody)
    if (!body) return invalid(c)
    await deps.confirmSegmentUpload.execute({
      ...body,
      userId: userId(c),
      videoId: c.req.param('id'),
    })
    return c.json(ok({ confirmed: true }))
  })

  routes.post('/:id/complete', requireUser, async (c) => {
    const body = await parseJson(c, CompleteBody)
    if (!body) return invalid(c)
    const user = userId(c)
    const video = await deps.completeRecording.execute({
      ...body,
      userId: user,
      videoId: c.req.param('id'),
    })
    return c.json(ok(presentVideo(video, user)))
  })

  routes.patch('/:id', requireUser, async (c) => {
    const body = await parseJson(c, UpdateBody)
    if (!body) return invalid(c)
    const user = userId(c)
    const video = await deps.updateVideo.execute({
      ...body,
      userId: user,
      videoId: c.req.param('id'),
    })
    return c.json(ok(presentVideo(video, user)))
  })

  routes.post('/:id/move', requireUser, async (c) => {
    const body = await parseJson(c, MoveBody)
    if (!body) return invalid(c)
    const user = userId(c)
    const video = await deps.moveVideo.execute({
      userId: user,
      videoId: c.req.param('id'),
      ...body,
    })
    return c.json(ok(presentVideo(video, user)))
  })

  routes.post('/:id/trash', requireUser, async (c) => {
    const user = userId(c)
    const video = await deps.trashVideo.execute({ userId: user, videoId: c.req.param('id') })
    return c.json(ok(presentVideo(video, user)))
  })

  routes.post('/:id/restore', requireUser, async (c) => {
    const user = userId(c)
    const video = await deps.restoreVideo.execute({ userId: user, videoId: c.req.param('id') })
    return c.json(ok(presentVideo(video, user)))
  })

  routes.post('/:id/render', requireUser, async (c) => {
    const user = userId(c)
    const video = await deps.requestRender.execute({ userId: user, videoId: c.req.param('id') })
    return c.json(ok(presentVideo(video, user)))
  })

  routes.post('/:id/transcribe', requireUser, async (c) => {
    const user = userId(c)
    const video = await deps.requestTranscription.execute({
      userId: user,
      videoId: c.req.param('id'),
    })
    return c.json(ok(presentVideo(video, user)))
  })

  routes.delete('/:id', requireUser, async (c) => {
    await deps.deleteVideo.execute({ userId: userId(c), videoId: c.req.param('id') })
    return c.json(ok({ deleted: true }))
  })

  return routes
}
