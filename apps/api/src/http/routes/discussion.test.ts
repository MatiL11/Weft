import { describe, expect, it } from 'vitest'
import type { CommentView, ReactionView } from '../presenters'
import { buildTestApp, postJson, sendJson, withRecordedVideo } from '../test-app'

const json = async <T>(res: Response) => (await res.json()) as { data: T; error: { code: string } }

async function setup() {
  const ctx = buildTestApp()
  const video = await withRecordedVideo(ctx)
  return { ctx, base: `/api/videos/${video.id}` }
}

/** Reads server-sent events from a streaming response until `count` have arrived. */
async function readEvents(res: Response, count: number) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  const events: { event: string; data: unknown }[] = []
  let buffer = ''
  while (events.length < count) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const event = /^event: (.+)$/m.exec(block)?.[1]
      const data = /^data: (.+)$/m.exec(block)?.[1]
      if (event && data) events.push({ event, data: JSON.parse(data) })
    }
  }
  await reader.cancel()
  return events
}

describe('discussion routes', () => {
  it('adds, edits, lists and deletes comments', async () => {
    const { ctx, base } = await setup()
    const created = await ctx.app.request(
      `${base}/comments`,
      postJson({ body: 'Nice demo', timestampMs: 2000 }),
    )
    expect(created.status).toBe(201)
    const comment = (await json<CommentView>(created)).data
    expect(comment).toMatchObject({
      author: { id: 'user_1', name: 'Ana' },
      body: 'Nice demo',
      timestampMs: 2000,
      parentId: null,
      deleted: false,
    })

    ctx.actAs({ id: 'user_2' })
    const reply = await ctx.app.request(
      `${base}/comments`,
      postJson({ body: 'Agreed', parentId: comment.id }),
    )
    expect((await json<CommentView>(reply)).data).toMatchObject({
      parentId: comment.id,
      author: { name: 'Beto' },
    })
    expect(
      (await ctx.app.request(`${base}/comments/${comment.id}`, sendJson('PATCH', { body: 'x' })))
        .status,
    ).toBe(403)

    ctx.actAs({ id: 'user_1' })
    const edited = await ctx.app.request(
      `${base}/comments/${comment.id}`,
      sendJson('PATCH', { body: 'Nicer demo' }),
    )
    expect((await json<CommentView>(edited)).data.body).toBe('Nicer demo')
    expect(
      (await ctx.app.request(`${base}/comments/${comment.id}`, { method: 'DELETE' })).status,
    ).toBe(200)

    ctx.actAs(null)
    const discussion = (
      await json<{ viewerId: string | null; canModerate: boolean; comments: CommentView[] }>(
        await ctx.app.request(`${base}/discussion`),
      )
    ).data
    expect(discussion).toMatchObject({ viewerId: null, canModerate: false })
    expect(discussion.comments.map((c) => [c.body, c.deleted])).toEqual([
      ['', true],
      ['Agreed', false],
    ])
  })

  it('asks anonymous viewers to sign in to comment, and validates input', async () => {
    const { ctx, base } = await setup()
    ctx.actAs(null)
    const anonymous = await ctx.app.request(`${base}/comments`, postJson({ body: 'Hi' }))
    expect(anonymous.status).toBe(401)
    expect((await json(anonymous)).error.code).toBe('comment.sign_in_required')
    ctx.actAs({ id: 'user_1' })
    expect((await ctx.app.request(`${base}/comments`, postJson({ body: 42 }))).status).toBe(400)
    expect((await ctx.app.request(`${base}/comments/nope`, sendJson('PATCH', {}))).status).toBe(400)
    expect((await ctx.app.request(`${base}/comments/nope`, { method: 'DELETE' })).status).toBe(404)
  })

  it('takes reactions from anyone watching, within a rate limit', async () => {
    const { ctx, base } = await setup()
    ctx.actAs(null)
    const react = () =>
      ctx.app.request(`${base}/reactions`, postJson({ emoji: '🎉', timestampMs: 1000 }))
    const first = await react()
    expect(first.status).toBe(201)
    expect((await json<ReactionView>(first)).data).toMatchObject({ emoji: '🎉', timestampMs: 1000 })
    await react()
    await react()
    // The test app allows 3 per viewer and minute.
    expect((await react()).status).toBe(429)
    expect((await ctx.app.request(`${base}/reactions`, postJson({ emoji: '🎉' }))).status).toBe(400)

    const discussion = await json<{ reactions: ReactionView[] }>(
      await ctx.app.request(`${base}/discussion`),
    )
    expect(discussion.data.reactions).toHaveLength(3)
  })

  it('streams new comments and reactions to everyone watching', async () => {
    const { ctx, base } = await setup()
    ctx.actAs(null)
    const stream = await ctx.app.request(`${base}/events`)
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    expect(stream.headers.get('cache-control')).toBe('no-cache, no-transform')
    const events = readEvents(stream, 4)

    await new Promise((r) => setTimeout(r, 20))
    ctx.actAs({ id: 'user_2' })
    const comment = (
      await json<CommentView>(
        await ctx.app.request(`${base}/comments`, postJson({ body: 'Live!', timestampMs: 500 })),
      )
    ).data
    await ctx.app.request(`${base}/reactions`, postJson({ emoji: '👏', timestampMs: 1500 }))
    await ctx.app.request(`${base}/comments/${comment.id}`, { method: 'DELETE' })

    expect(await events).toEqual([
      { event: 'ready', data: {} },
      {
        event: 'comment.created',
        data: expect.objectContaining({ id: comment.id, body: 'Live!', timestampMs: 500 }),
      },
      {
        event: 'reaction.created',
        data: expect.objectContaining({ emoji: '👏', timestampMs: 1500 }),
      },
      { event: 'comment.deleted', data: { commentId: comment.id } },
    ])
  })

  it('keeps hidden videos hidden', async () => {
    const { ctx, base } = await setup()
    await ctx.app.request(base, sendJson('PATCH', { privacy: 'private' }))
    ctx.actAs({ id: 'user_2' })
    expect((await ctx.app.request(`${base}/discussion`)).status).toBe(404)
    expect((await ctx.app.request(`${base}/events`)).status).toBe(404)
    expect((await ctx.app.request(`${base}/comments`, postJson({ body: 'Hi' }))).status).toBe(404)
  })
})
