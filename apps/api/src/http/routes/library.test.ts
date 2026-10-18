import { describe, expect, it } from 'vitest'
import type { VideoView } from '../presenters'
import {
  buildTestApp,
  postJson,
  runRenders,
  runTranscriptions,
  sendJson,
  withRecordedVideo,
} from '../test-app'

const json = async <T>(res: Response) => (await res.json()) as { data: T; error: { code: string } }
type Item = VideoView & { match: { startMs: number; text: string } | null }

async function setup() {
  const ctx = buildTestApp()
  const video = await withRecordedVideo(ctx)
  return { ctx, video, base: `/api/videos/${video.id}` }
}

describe('library routes', () => {
  it('creates folders, moves videos into them and lists by folder', async () => {
    const { ctx, base, video } = await setup()
    const created = await ctx.app.request(
      '/api/workspaces/ws_1/folders',
      postJson({ name: 'Demos' }),
    )
    expect(created.status).toBe(201)
    const folder = (await json<{ id: string; name: string }>(created)).data
    expect((await ctx.app.request('/api/workspaces/ws_1/folders', postJson({}))).status).toBe(400)

    const moved = await ctx.app.request(`${base}/move`, postJson({ folderId: folder.id }))
    expect((await json<VideoView>(moved)).data.folderId).toBe(folder.id)
    expect((await ctx.app.request(`${base}/move`, postJson({}))).status).toBe(400)

    const inFolder = await json<Item[]>(await ctx.app.request(`/api/videos?folderId=${folder.id}`))
    expect(inFolder.data.map((v) => v.id)).toEqual([video.id])
    const top = await json<Item[]>(await ctx.app.request('/api/videos?folderId=root'))
    expect(top.data).toEqual([])

    const renamed = await ctx.app.request(
      `/api/folders/${folder.id}`,
      sendJson('PATCH', { name: 'Q4' }),
    )
    expect((await json<{ name: string }>(renamed)).data.name).toBe('Q4')
    expect((await ctx.app.request(`/api/folders/${folder.id}`, sendJson('PATCH', {}))).status).toBe(
      400,
    )
    const folders = await json<{ name: string }[]>(
      await ctx.app.request('/api/workspaces/ws_1/folders'),
    )
    expect(folders.data.map((f) => f.name)).toEqual(['Q4'])
    expect((await ctx.app.request(`/api/folders/${folder.id}`, { method: 'DELETE' })).status).toBe(
      200,
    )
    expect(
      (await json<Item[]>(await ctx.app.request('/api/videos?folderId=root'))).data,
    ).toHaveLength(1)
  })

  it('searches with transcript matches', async () => {
    const { ctx } = await setup()
    await runRenders(ctx)
    await runTranscriptions(ctx)
    const found = await json<Item[]>(await ctx.app.request('/api/videos?q=demo'))
    expect(found.data[0]?.match).toEqual({ startMs: 2500, endMs: 5000, text: 'Esta es la demo.' })
  })

  it('trashes and restores videos', async () => {
    const { ctx, base, video } = await setup()
    const trashed = await json<VideoView>(
      await ctx.app.request(`${base}/trash`, { method: 'POST' }),
    )
    expect(trashed.data.trashedAt).not.toBeNull()
    expect((await json<Item[]>(await ctx.app.request('/api/videos'))).data).toEqual([])
    expect(
      (await json<Item[]>(await ctx.app.request('/api/videos?trash=1'))).data.map((v) => v.id),
    ).toEqual([video.id])

    ctx.actAs(null)
    expect((await ctx.app.request(base)).status).toBe(404)
    ctx.actAs({ id: 'user_1' })
    await ctx.app.request(`${base}/restore`, { method: 'POST' })
    ctx.actAs(null)
    expect((await ctx.app.request(base)).status).toBe(200)
  })
})
