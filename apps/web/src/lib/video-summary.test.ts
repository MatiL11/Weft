import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchVideoSummary } from './video-summary'

const SUMMARY = {
  id: 'abc',
  title: 'Demo',
  status: 'ready',
  privacy: 'link',
  durationMs: 6000,
  createdAt: '2026-10-16T10:00:00.000Z',
  isOwner: false,
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchVideoSummary', () => {
  it('returns the video and forwards the viewer cookie', async () => {
    const fetch = vi.fn(async () => Response.json({ data: SUMMARY, error: null }))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchVideoSummary('http://api:4000', 'abc', 'session=1')).toEqual({
      kind: 'ok',
      video: SUMMARY,
    })
    expect(fetch).toHaveBeenCalledWith('http://api:4000/api/videos/abc', {
      headers: { cookie: 'session=1' },
      cache: 'no-store',
    })
  })

  it('reports missing or hidden videos as not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ data: null, error: { code: 'video.not_found' } }, { status: 404 }),
      ),
    )
    expect(await fetchVideoSummary('http://api:4000', 'abc', '')).toEqual({ kind: 'not_found' })
  })

  it('rejects ids that cannot be video ids without calling the API', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await fetchVideoSummary('http://api:4000', '../workspaces', '')).toEqual({
      kind: 'not_found',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports server errors and unreachable APIs as errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 500 })),
    )
    expect(await fetchVideoSummary('http://api:4000', 'abc', '')).toEqual({ kind: 'error' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('down'))),
    )
    expect(await fetchVideoSummary('http://api:4000', 'abc', '')).toEqual({ kind: 'error' })
  })
})
