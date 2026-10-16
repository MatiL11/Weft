import { FAKE_RENDER_OUTPUT } from '@weft/core/testing'
import { describe, expect, it } from 'vitest'
import type { VideoView } from '../presenters'
import { buildTestApp, postJson, runRenders, sendJson, withRecordedVideo } from '../test-app'

async function setup() {
  const ctx = buildTestApp()
  const video = await withRecordedVideo(ctx)
  return { ctx, video, base: `/api/videos/${video.id}` }
}

const json = async <T = VideoView>(res: Response) =>
  (await res.json()) as { data: T; error: { code: string } }

describe('playback routes', () => {
  it('plays the raw recording until the render is ready, then the rendered ladder', async () => {
    const { ctx, base } = await setup()
    ctx.actAs(null)

    const before = await json(await ctx.app.request(base))
    expect(before.data).toMatchObject({
      durationMs: 6000,
      playback: { playlistUrl: `${base}/playlist.m3u8`, skip: null, processed: false },
      posterUrl: null,
      thumbnails: null,
      downloadUrl: null,
      owner: null,
    })
    expect(await (await ctx.app.request(`${base}/playlist.m3u8`)).text()).toContain('media/init')

    await runRenders(ctx)
    const after = await json(await ctx.app.request(base))
    expect(after.data).toMatchObject({
      playback: { processed: true },
      posterUrl: `${base}/r/1/poster.jpg`,
      thumbnails: { url: `${base}/r/1/sprite.jpg`, ...FAKE_RENDER_OUTPUT.sprite },
      downloadUrl: `${base}/download`,
    })
    const master = await ctx.app.request(`${base}/playlist.m3u8`)
    expect(master.headers.get('cache-control')).toBe('no-cache')
    expect(await master.text()).toContain(
      '#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"\nr/1/720p/index.m3u8',
    )
  })

  it('serves render files: playlists inline, media by redirect, only for the current version', async () => {
    const { ctx, video, base } = await setup()
    await runRenders(ctx)
    ctx.storage.putText(`videos/${video.id}/r1/720p/index.m3u8`, '#EXTM3U\nseg-00000.m4s\n')
    ctx.actAs(null)

    const playlist = await ctx.app.request(`${base}/r/1/720p/index.m3u8`)
    expect(playlist.headers.get('content-type')).toBe('application/vnd.apple.mpegurl')
    expect(await playlist.text()).toBe('#EXTM3U\nseg-00000.m4s\n')

    const segment = await ctx.app.request(`${base}/r/1/720p/seg-00000.m4s`)
    expect(segment.status).toBe(302)
    expect(segment.headers.get('location')).toBe(
      `fake-get://videos/${video.id}/r1/720p/seg-00000.m4s`,
    )

    expect((await ctx.app.request(`${base}/r/2/poster.jpg`)).status).toBe(404)
    expect((await ctx.app.request(`${base}/r/1/..%2F..%2Fsecret`)).status).toBe(404)
    expect((await ctx.app.request(`${base}/r/1/1080p/index.m3u8`)).status).toBe(404)
  })

  it('downloads the rendered MP4 under the video title', async () => {
    const { ctx, video, base } = await setup()
    expect((await ctx.app.request(`${base}/download`)).status).toBe(404)
    await runRenders(ctx)
    const res = await ctx.app.request(`${base}/download`)
    expect(res.headers.get('location')).toBe(
      `fake-get://videos/${video.id}/r1/video.mp4?download=Demo.mp4`,
    )
  })

  it('asks for the password, sets an access cookie on unlock, and limits guesses', async () => {
    const { ctx, base } = await setup()
    await ctx.app.request(base, sendJson('PATCH', { privacy: 'password', password: 'abcd' }))
    ctx.actAs(null)

    const locked = await ctx.app.request(base)
    expect(locked.status).toBe(401)
    expect((await json(locked)).error.code).toBe('video.password_required')

    const wrong = await ctx.app.request(`${base}/unlock`, postJson({ password: 'nope' }))
    expect(wrong.status).toBe(403)
    expect(await ctx.app.request(`${base}/unlock`, postJson({}))).toHaveProperty('status', 400)

    const right = await ctx.app.request(`${base}/unlock`, postJson({ password: 'abcd' }))
    expect(right.status).toBe(200)
    const cookie = right.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(
      /^weft_access_vid_1=[^;]+; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    )

    const opened = await ctx.app.request(base, { headers: { cookie: cookie.split(';')[0]! } })
    expect(opened.status).toBe(200)

    // The test app allows 3 attempts per video per minute (invalid bodies don't count).
    await ctx.app.request(`${base}/unlock`, postJson({ password: 'guess' }))
    const limited = await ctx.app.request(`${base}/unlock`, postJson({ password: 'abcd' }))
    expect(limited.status).toBe(429)
  })

  it('leaves access cookies usable over plain HTTP for local installs', async () => {
    const ctx = buildTestApp({ publicUrl: 'http://localhost:3000' })
    const video = await withRecordedVideo(ctx)
    await ctx.app.request(
      `/api/videos/${video.id}`,
      sendJson('PATCH', { privacy: 'password', password: 'abcd' }),
    )
    const res = await ctx.app.request(
      `/api/videos/${video.id}/unlock`,
      postJson({ password: 'abcd' }),
    )
    expect(res.headers.get('set-cookie')).not.toContain('Secure')
  })
})
