import { describe, expect, it } from 'vitest'
import type { VideoView } from '../presenters'
import { buildTestApp, runRenders, sendJson, withRecordedVideo } from '../test-app'

async function setup() {
  const ctx = buildTestApp()
  const video = await withRecordedVideo(ctx)
  return { ctx, video, base: `/api/videos/${video.id}` }
}

const json = async <T = VideoView>(res: Response) =>
  (await res.json()) as { data: T; error: { code: string } }

describe('video management routes', () => {
  it("lists the caller's workspace videos", async () => {
    const { ctx, video } = await setup()
    const res = await ctx.app.request('/api/videos')
    expect(res.status).toBe(200)
    expect((await json<VideoView[]>(res)).data).toEqual([
      expect.objectContaining({ id: video.id, title: 'Demo', isOwner: true }),
    ])
    expect((await ctx.app.request('/api/videos?workspaceId=ws_other')).status).toBe(403)

    ctx.actAs(null)
    expect((await ctx.app.request('/api/videos')).status).toBe(401)
  })

  it('updates title, privacy and trim, and re-renders on a new trim', async () => {
    const { ctx, base } = await setup()
    await runRenders(ctx)

    const res = await ctx.app.request(
      base,
      sendJson('PATCH', {
        title: 'Q4 plan',
        privacy: 'workspace',
        trim: { startMs: 1000, endMs: 5000 },
      }),
    )
    expect(res.status).toBe(200)
    expect((await json(res)).data).toMatchObject({
      title: 'Q4 plan',
      privacy: 'workspace',
      durationMs: 4000,
      // Until the new render lands, the raw recording plays without the trimmed parts.
      playback: { skip: { startMs: 1000, endMs: 5000 }, processed: false },
      owner: {
        renderState: 'queued',
        recordingDurationMs: 6000,
        trim: { startMs: 1000, endMs: 5000 },
        hasPassword: false,
      },
    })

    await runRenders(ctx)
    expect((await json(await ctx.app.request(base))).data.playback).toMatchObject({
      skip: null,
      processed: true,
    })
  })

  it('rejects invalid edits', async () => {
    const { ctx, base } = await setup()
    expect((await ctx.app.request(base, sendJson('PATCH', { privacy: 'public' }))).status).toBe(400)
    const badTrim = await ctx.app.request(
      base,
      sendJson('PATCH', { trim: { startMs: 0, endMs: 60_000 } }),
    )
    expect((await json(badTrim)).error.code).toBe('video.trim_invalid')

    ctx.actAs({ id: 'intruder' })
    expect((await ctx.app.request(base, sendJson('PATCH', { title: 'x' }))).status).toBe(403)
  })

  it('lets the owner retry a render', async () => {
    const { ctx, base } = await setup()
    const res = await ctx.app.request(`${base}/render`, { method: 'POST' })
    expect((await json(res)).data.owner).toMatchObject({ renderState: 'queued' })
    expect(ctx.renders.jobs.at(-1)).toEqual({ videoId: 'vid_1', version: 2 })
  })
})
