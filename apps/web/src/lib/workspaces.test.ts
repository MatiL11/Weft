import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWorkspaces, parseWorkspacesResponse } from './workspaces'

const MEMBERSHIP = {
  workspace: {
    id: 'ws_1',
    name: "Ana's workspace",
    slug: 'ana-s-workspace',
    createdAt: '2026-10-15T12:00:00.000Z',
  },
  role: 'owner',
}

describe('parseWorkspacesResponse', () => {
  it('returns memberships on success', () => {
    expect(parseWorkspacesResponse(200, { data: [MEMBERSHIP], error: null })).toEqual({
      kind: 'ok',
      memberships: [MEMBERSHIP],
    })
  })

  it('detects an expired or missing session', () => {
    expect(
      parseWorkspacesResponse(401, { data: null, error: { code: 'unauthorized', message: 'x' } }),
    ).toEqual({
      kind: 'unauthenticated',
    })
  })

  it('surfaces the API error message', () => {
    expect(
      parseWorkspacesResponse(500, {
        data: null,
        error: { code: 'internal_error', message: 'Something went wrong.' },
      }),
    ).toEqual({ kind: 'error', message: 'Something went wrong.' })
  })

  it('falls back to a generic message when a failed response has no error', () => {
    expect(parseWorkspacesResponse(502, { data: null, error: null })).toEqual({
      kind: 'error',
      message: 'Could not load workspaces.',
    })
  })

  it.each([null, 'html', { data: [] }, { data: 'nope', error: null }])(
    'rejects malformed body %j',
    (body) => {
      expect(parseWorkspacesResponse(200, body)).toMatchObject({ kind: 'error' })
    },
  )
})

describe('fetchWorkspaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards the session cookie and parses the response', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [MEMBERSHIP], error: null }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchWorkspaces('http://api:4000', 'session=abc')

    expect(result).toEqual({ kind: 'ok', memberships: [MEMBERSHIP] })
    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/workspaces', {
      headers: { cookie: 'session=abc' },
      cache: 'no-store',
    })
  })

  it('handles a non-JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 502 })),
    )
    expect(await fetchWorkspaces('http://api:4000', '')).toMatchObject({ kind: 'error' })
  })

  it('reports an unreachable API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    )
    expect(await fetchWorkspaces('http://api:4000', '')).toEqual({
      kind: 'error',
      message: 'The API is unreachable. Is it running?',
    })
  })
})
