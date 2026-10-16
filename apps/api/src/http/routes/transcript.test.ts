import { FAKE_TRANSCRIPT_SEGMENTS } from '@weft/core/testing'
import { describe, expect, it } from 'vitest'
import type { VideoView } from '../presenters'
import {
  NOW,
  buildTestApp,
  runRenders,
  runTranscriptions,
  sendJson,
  withRecordedVideo,
} from '../test-app'

const json = async <T = VideoView>(res: Response) =>
  (await res.json()) as { data: T; error: { code: string } }

async function setup() {
  const ctx = buildTestApp()
  const video = await withRecordedVideo(ctx)
  return { ctx, base: `/api/videos/${video.id}` }
}

describe('transcript routes', () => {
  it('serves the transcript and WebVTT captions once the render is transcribed', async () => {
    const { ctx, base } = await setup()
    await runRenders(ctx)
    expect((await ctx.app.request(`${base}/captions.vtt`)).status).toBe(404)
    expect((await json(await ctx.app.request(base))).data.captions).toBeNull()

    await runTranscriptions(ctx)
    ctx.actAs(null)
    const view = (await json(await ctx.app.request(base))).data
    expect(view.captions).toEqual({
      language: 'es',
      transcriptUrl: `${base}/transcript?v=1-${NOW.getTime()}`,
      vttUrl: `${base}/captions.vtt?v=1-${NOW.getTime()}`,
    })

    const transcript = await json<{ language: string; segments: unknown[] }>(
      await ctx.app.request(`${base}/transcript`),
    )
    expect(transcript.data).toEqual({ language: 'es', segments: FAKE_TRANSCRIPT_SEGMENTS })

    const vtt = await ctx.app.request(`${base}/captions.vtt`)
    expect(vtt.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    expect(await vtt.text()).toContain('00:00:00.000 --> 00:00:02.500\nHola a todos.')
  })

  it('lets the owner pick the language and retry, and reports progress only to them', async () => {
    const { ctx, base } = await setup()
    await runRenders(ctx)
    const changed = await ctx.app.request(base, sendJson('PATCH', { transcriptLanguage: 'en' }))
    expect((await json(changed)).data.owner).toMatchObject({
      transcriptLanguage: 'en',
      transcriptionState: 'queued',
    })
    expect(
      (await ctx.app.request(base, sendJson('PATCH', { transcriptLanguage: 'xx' }))).status,
    ).toBe(400)

    await runTranscriptions(ctx)
    expect((await json(await ctx.app.request(base))).data.captions?.language).toBe('en')

    const retried = await ctx.app.request(`${base}/transcribe`, { method: 'POST' })
    expect((await json(retried)).data.owner?.transcriptionState).toBe('queued')

    ctx.actAs({ id: 'intruder' })
    expect((await ctx.app.request(`${base}/transcribe`, { method: 'POST' })).status).toBe(403)
    ctx.actAs(null)
    expect((await json(await ctx.app.request(base))).data.owner).toBeNull()
  })

  it('hides captions of an older render after a new trim', async () => {
    const { ctx, base } = await setup()
    await runRenders(ctx)
    await runTranscriptions(ctx)
    await ctx.app.request(base, sendJson('PATCH', { trim: { startMs: 1000, endMs: 5000 } }))
    expect((await ctx.app.request(`${base}/transcript`)).status).toBe(404)
  })
})
