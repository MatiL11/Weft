import { InMemoryWorkspaceRepository } from '@weft/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, NOW, postJson, type TestAppOptions } from './test-app'

const buildApp = (options: TestAppOptions = {}) => buildTestApp(options)

describe('HTTP app', () => {
  let ctx: ReturnType<typeof buildApp>

  beforeEach(() => {
    ctx = buildApp()
  })

  it('reports health without authentication', async () => {
    const res = await buildApp({ user: null }).app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { status: 'ok' }, error: null })
  })

  it('sets security headers', async () => {
    const res = await ctx.app.request('/health')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('delegates /api/auth/* to the auth handler', async () => {
    const res = await ctx.app.request('/api/auth/sign-up/email', postJson({}))
    expect(res.status).toBe(200)
    expect(ctx.authHandler).toHaveBeenCalledOnce()
  })

  it('tells the auth handler the client address from the trusted proxy, never the caller', async () => {
    const forwarded = (headers: Record<string, string>) =>
      ctx.app.request('/api/auth/sign-in/email', {
        ...postJson({ email: 'a@b.co' }),
        headers: { 'content-type': 'application/json', ...headers },
      })
    const received = () => {
      const calls = ctx.authHandler.mock.calls as unknown as [Request][]
      return calls.at(-1)![0]
    }

    await forwarded({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9', 'x-weft-client-ip': '1.1.1.1' })
    expect(received().headers.get('x-weft-client-ip')).toBe('203.0.113.9')
    expect(await received().json()).toEqual({ email: 'a@b.co' })

    await forwarded({ 'x-weft-client-ip': '1.1.1.1' })
    expect(received().headers.get('x-weft-client-ip')).toBeNull()
  })

  it('rejects unauthenticated API requests', async () => {
    const res = await buildApp({ user: null }).app.request('/api/workspaces')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ data: null, error: { code: 'unauthorized' } })
  })

  it('creates and lists workspaces for the session user', async () => {
    const created = await ctx.app.request('/api/workspaces', postJson({ name: 'Acme' }))
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({
      data: { id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW.toISOString() },
      error: null,
    })

    const listed = await ctx.app.request('/api/workspaces')
    expect(await listed.json()).toEqual({
      data: [
        {
          workspace: { id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW.toISOString() },
          role: 'owner',
        },
      ],
      error: null,
    })
  })

  it.each([[{}], [{ name: 42 }], ['not json']])(
    'returns 400 for an invalid body %j',
    async (body) => {
      const init =
        typeof body === 'string'
          ? { method: 'POST', headers: { 'content-type': 'application/json' }, body }
          : postJson(body)
      const res = await ctx.app.request('/api/workspaces', init)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'validation_error' } })
    },
  )

  it('maps domain errors to 400 with their code', async () => {
    const res = await ctx.app.request('/api/workspaces', postJson({ name: '   ' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'workspace.name_invalid' } })
  })

  it('hides unexpected errors behind a 500 and logs them', async () => {
    const failing = new InMemoryWorkspaceRepository()
    failing.listForUser = async () => {
      throw new Error('db exploded: secret details')
    }
    const { app, logger } = buildApp({ workspaces: failing })

    const res = await app.request('/api/workspaces')

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      data: null,
      error: { code: 'internal_error', message: 'Something went wrong.' },
    })
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('rejects oversized JSON bodies', async () => {
    const res = await ctx.app.request('/api/workspaces', postJson({ name: 'x'.repeat(70_000) }))
    expect(res.status).toBe(413)
  })
})
