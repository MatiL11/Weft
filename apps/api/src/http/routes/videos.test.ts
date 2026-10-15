import { describe, expect, it } from 'vitest'
import { buildTestApp, NOW, postJson } from '../test-app'

const SHA = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg='

async function setup() {
  const ctx = buildTestApp()
  await ctx.workspaces.createWithMember(
    { id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW },
    'user_1',
    'owner',
  )
  return ctx
}

type Ctx = Awaited<ReturnType<typeof setup>>

async function startVideo(ctx: Ctx) {
  const res = await ctx.app.request('/api/videos', postJson({ title: 'Demo' }))
  const body = (await res.json()) as { data: { video: { id: string }; shareUrl: string } }
  return { res, ...body.data }
}

async function uploadSegment(
  ctx: Ctx,
  videoId: string,
  kind: 'init' | 'media',
  index: number,
  startMs = 0,
) {
  const prepare = await ctx.app.request(
    `/api/videos/${videoId}/segments`,
    postJson({ kind, index, startMs, byteLength: 100, sha256: SHA }),
  )
  expect(prepare.status).toBe(200)
  const key =
    kind === 'init'
      ? `videos/${videoId}/init.mp4`
      : `videos/${videoId}/seg-${String(index).padStart(6, '0')}.m4s`
  ctx.storage.simulateUpload(key, 100)
  const confirm = await ctx.app.request(
    `/api/videos/${videoId}/segments/confirm`,
    postJson({ kind, index }),
  )
  expect(confirm.status).toBe(200)
  return (await prepare.json()) as { data: { url: string } }
}

describe('video routes', () => {
  it('starts a recording in the personal workspace and returns its share link', async () => {
    const ctx = await setup()
    const { res, video, shareUrl } = await startVideo(ctx)

    expect(res.status).toBe(201)
    expect(video).toMatchObject({ id: 'vid_1', status: 'recording', isOwner: true })
    expect(shareUrl).toBe('https://weft.test/v/vid_1')
  })

  it('requires a session to record', async () => {
    const ctx = await setup()
    ctx.actAs(null)
    expect((await ctx.app.request('/api/videos', postJson({ title: 'x' }))).status).toBe(401)
  })

  it('refuses to record without any workspace', async () => {
    const ctx = buildTestApp()
    const res = await ctx.app.request('/api/videos', postJson({ title: 'x' }))
    expect(res.status).toBe(403)
  })

  it('returns presigned upload URLs bound to the checksum', async () => {
    const ctx = await setup()
    const { video } = await startVideo(ctx)
    const { data } = await uploadSegment(ctx, video.id, 'media', 0)
    expect(data.url).toContain(`sha=${SHA}`)
  })

  it.each([
    [{ kind: 'thumbnail', index: 0, startMs: 0, byteLength: 1, sha256: SHA }],
    [{ kind: 'media', index: 0, startMs: -5, byteLength: 1, sha256: SHA }],
    [{ kind: 'media', index: '0' }],
  ])('validates segment requests %#', async (body) => {
    const ctx = await setup()
    const { video } = await startVideo(ctx)
    const res = await ctx.app.request(`/api/videos/${video.id}/segments`, postJson(body))
    expect(res.status).toBe(400)
  })

  it('maps domain checksum errors to 400', async () => {
    const ctx = await setup()
    const { video } = await startVideo(ctx)
    const res = await ctx.app.request(
      `/api/videos/${video.id}/segments`,
      postJson({ kind: 'media', index: 0, startMs: 0, byteLength: 10, sha256: 'nope' }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'video.segment_checksum_invalid' } })
  })

  it('serves a live playlist while recording and a closed one after completing', async () => {
    const ctx = await setup()
    const { video } = await startVideo(ctx)
    await uploadSegment(ctx, video.id, 'init', 0)
    await uploadSegment(ctx, video.id, 'media', 0, 0)
    await uploadSegment(ctx, video.id, 'media', 1, 4000)

    ctx.actAs(null) // anyone with the link
    const live = await ctx.app.request(`/api/videos/${video.id}/playlist.m3u8`)
    expect(live.headers.get('content-type')).toBe('application/vnd.apple.mpegurl')
    expect(live.headers.get('cache-control')).toBe('no-store')
    const liveText = await live.text()
    expect(liveText).toContain('#EXT-X-MAP:URI="media/init"')
    expect(liveText).toContain('media/0')
    expect(liveText).not.toContain('media/1')
    expect(liveText).not.toContain('#EXT-X-ENDLIST')

    ctx.actAs({ id: 'user_1' })
    const done = await ctx.app.request(
      `/api/videos/${video.id}/complete`,
      postJson({ durationMs: 6000, segmentCount: 2 }),
    )
    expect(done.status).toBe(200)

    ctx.actAs(null)
    const ended = await (await ctx.app.request(`/api/videos/${video.id}/playlist.m3u8`)).text()
    expect(ended).toContain('media/1')
    expect(ended).toContain('#EXT-X-ENDLIST')
  })

  it('redirects media requests to short-lived storage URLs', async () => {
    const ctx = await setup()
    const { video } = await startVideo(ctx)
    ctx.actAs(null)

    const init = await ctx.app.request(`/api/videos/${video.id}/media/init`)
    expect(init.status).toBe(302)
    expect(init.headers.get('location')).toBe(`fake-get://videos/${video.id}/init.mp4`)

    const seg = await ctx.app.request(`/api/videos/${video.id}/media/3`)
    expect(seg.headers.get('location')).toBe(`fake-get://videos/${video.id}/seg-000003.m4s`)

    expect((await ctx.app.request(`/api/videos/${video.id}/media/-1`)).status).toBe(400)
    expect((await ctx.app.request(`/api/videos/${video.id}/media/abc`)).status).toBe(400)
  })

  it('reports conflicts and missing segments when completing', async () => {
    const ctx = await setup()
    const { video } = await startVideo(ctx)
    const res = await ctx.app.request(
      `/api/videos/${video.id}/complete`,
      postJson({ durationMs: 1000, segmentCount: 1 }),
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'video.segments_missing' } })
  })

  it('hides private videos from other people as 404', async () => {
    const ctx = await setup()
    const { video } = await startVideo(ctx)
    const stored = await ctx.videos.findById(video.id)
    await ctx.videos.update({ ...stored!, privacy: 'private' })

    ctx.actAs({ id: 'someone_else' })
    expect((await ctx.app.request(`/api/videos/${video.id}`)).status).toBe(404)
    ctx.actAs({ id: 'user_1' })
    const own = await ctx.app.request(`/api/videos/${video.id}`)
    expect(await own.json()).toMatchObject({ data: { isOwner: true, privacy: 'private' } })
  })

  it('only lets the owner upload', async () => {
    const ctx = await setup()
    const { video } = await startVideo(ctx)
    ctx.actAs({ id: 'intruder' })
    const res = await ctx.app.request(
      `/api/videos/${video.id}/segments`,
      postJson({ kind: 'init', index: 0, startMs: 0, byteLength: 10, sha256: SHA }),
    )
    expect(res.status).toBe(403)
  })
})
