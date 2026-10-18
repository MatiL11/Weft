import { describe, expect, it } from 'vitest'
import { buildTestApp, postJson, withRecordedVideo } from '../test-app'

const json = async <T>(res: Response) => (await res.json()) as { data: T; error: { code: string } }

describe('analytics routes', () => {
  it('records anonymous views with a viewer cookie, merges progress and shows stats to the owner', async () => {
    const ctx = buildTestApp()
    const video = await withRecordedVideo(ctx)
    const base = `/api/videos/${video.id}`
    ctx.actAs(null)

    const started = await ctx.app.request(`${base}/views`, { method: 'POST' })
    expect(started.status).toBe(201)
    const cookie = started.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(
      /^weft_viewer=[\w-]{22}; Max-Age=31536000; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    )
    const { viewId } = (await json<{ viewId: string }>(started)).data

    // The second view from the same browser reuses the cookie.
    const again = await ctx.app.request(`${base}/views`, {
      method: 'POST',
      headers: { cookie: cookie.split(';')[0]! },
    })
    expect(again.headers.get('set-cookie')).toBeNull()

    expect(
      (
        await ctx.app.request(
          `${base}/views/${viewId}/progress`,
          postJson({ buckets: 3, watchedMs: 1200 }),
        )
      ).status,
    ).toBe(200)
    // sendBeacon posts the same JSON (as a Blob); bad bodies are refused.
    expect(
      (await ctx.app.request(`${base}/views/${viewId}/progress`, postJson({ buckets: -1 }))).status,
    ).toBe(400)
    expect(
      (await ctx.app.request(`${base}/views/nope/progress`, postJson({ buckets: 1, watchedMs: 0 })))
        .status,
    ).toBe(404)

    expect((await ctx.app.request(`${base}/stats`)).status).toBe(401)
    ctx.actAs({ id: 'user_2' })
    expect((await ctx.app.request(`${base}/stats`)).status).toBe(403)
    ctx.actAs({ id: 'user_1' })
    const stats = await json<{ views: number; uniqueViewers: number; retention: number[] }>(
      await ctx.app.request(`${base}/stats`),
    )
    expect(stats.data).toMatchObject({ views: 2, uniqueViewers: 1 })
    expect(stats.data.retention.slice(0, 3)).toEqual([0.5, 0.5, 0])

    const [card] = (await json<{ viewCount: number }[]>(await ctx.app.request('/api/videos'))).data
    expect(card?.viewCount).toBe(2)
  })

  it("doesn't count the owner, and limits views per address", async () => {
    const ctx = buildTestApp()
    const video = await withRecordedVideo(ctx)
    const start = () => ctx.app.request(`/api/videos/${video.id}/views`, { method: 'POST' })
    expect((await json<{ viewId: string | null }>(await start())).data.viewId).toBeNull()
    ctx.actAs(null)
    await start()
    await start()
    // The test app allows 3 per address, video and hour (the owner's view counted too).
    expect((await start()).status).toBe(429)
  })
})
