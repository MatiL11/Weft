import { describe, expect, it } from 'vitest'
import { buildTestApp, runRenders, sendJson, withRecordedVideo } from '../test-app'

const oembed = (url: string, extra = '') => `/api/oembed?url=${encodeURIComponent(url)}${extra}`

describe('oEmbed', () => {
  it('describes link-shared videos as an embeddable player', async () => {
    const ctx = buildTestApp()
    const video = await withRecordedVideo(ctx)
    await runRenders(ctx)

    const res = await ctx.app.request(oembed(`https://weft.test/v/${video.id}`, '&maxwidth=640'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      version: '1.0',
      type: 'video',
      provider_name: 'Weft',
      provider_url: 'https://weft.test',
      title: 'Demo',
      width: 640,
      height: 360,
      html: `<iframe src="https://weft.test/embed/${video.id}" width="640" height="360" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`,
      thumbnail_url: `https://weft.test/api/videos/${video.id}/r/1/poster.jpg`,
      thumbnail_width: 1280,
      thumbnail_height: 720,
    })
  })

  it('keeps sizes positive and within maxwidth/maxheight', async () => {
    const ctx = buildTestApp()
    const video = await withRecordedVideo(ctx)
    await runRenders(ctx)
    const size = async (extra: string) => {
      const body = (await (
        await ctx.app.request(oembed(`https://weft.test/v/${video.id}`, extra))
      ).json()) as { width: number; height: number }
      return [body.width, body.height]
    }
    expect(await size('&maxwidth=-100')).toEqual([960, 540])
    expect(await size('&maxheight=180')).toEqual([320, 180])
    expect(await size('&maxwidth=50')).toEqual([200, 113])
  })

  it('works before rendering, without a thumbnail', async () => {
    const ctx = buildTestApp()
    const video = await withRecordedVideo(ctx)
    const body = (await (
      await ctx.app.request(oembed(`https://weft.test/embed/${video.id}`))
    ).json()) as Record<string, unknown>
    expect(body).toMatchObject({ width: 960, height: 540 })
    expect(body).not.toHaveProperty('thumbnail_url')
  })

  it('refuses other sites, unknown, protected and non-JSON requests', async () => {
    const ctx = buildTestApp()
    const video = await withRecordedVideo(ctx)
    expect((await ctx.app.request(oembed(`https://evil.example/v/${video.id}`))).status).toBe(404)
    expect((await ctx.app.request(oembed('https://weft.test/v/missing'))).status).toBe(404)
    expect((await ctx.app.request(oembed('not a url'))).status).toBe(404)
    expect((await ctx.app.request(oembed('https://weft.test/settings'))).status).toBe(404)
    expect(
      (await ctx.app.request(oembed(`https://weft.test/v/${video.id}`, '&format=xml'))).status,
    ).toBe(501)

    await ctx.app.request(
      `/api/videos/${video.id}`,
      sendJson('PATCH', { privacy: 'password', password: 'abcd1234' }),
    )
    expect((await ctx.app.request(oembed(`https://weft.test/v/${video.id}`))).status).toBe(404)
  })
})
