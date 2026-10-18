import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAs, fetchSessionUserId } from './members'

afterEach(() => vi.unstubAllGlobals())

describe('fetchAs', () => {
  it('returns data, not-found for missing or forbidden resources, and errors otherwise', async () => {
    const stub = (res: Response | Error) =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => (res instanceof Error ? Promise.reject(res) : res)),
      )

    stub(Response.json({ data: { a: 1 }, error: null }))
    expect(await fetchAs('http://api/x', 'c=1')).toEqual({ kind: 'ok', data: { a: 1 } })
    stub(new Response(null, { status: 404 }))
    expect(await fetchAs('http://api/x', '')).toEqual({ kind: 'not_found' })
    stub(new Response(null, { status: 401 }))
    expect(await fetchAs('http://api/x', '')).toEqual({ kind: 'not_found' })
    stub(new Response('oops', { status: 500 }))
    expect(await fetchAs('http://api/x', '')).toEqual({ kind: 'error' })
    stub(Response.json({ data: null, error: null }))
    expect(await fetchAs('http://api/x', '')).toEqual({ kind: 'error' })
    stub(new TypeError('down'))
    expect(await fetchAs('http://api/x', '')).toEqual({ kind: 'error' })
  })
})

describe('fetchSessionUserId', () => {
  it('reads the user id from the session, or null when signed out or unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ session: {}, user: { id: 'u1' } })),
    )
    expect(await fetchSessionUserId('http://api', 'c')).toBe('u1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(null)),
    )
    expect(await fetchSessionUserId('http://api', '')).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500 })),
    )
    expect(await fetchSessionUserId('http://api', '')).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('down'))),
    )
    expect(await fetchSessionUserId('http://api', '')).toBeNull()
  })
})
