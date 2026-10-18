import { UploadError } from '@weft/recorder/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addComment,
  addReaction,
  createUploadApi,
  deleteComment,
  editComment,
  fetchDiscussion,
  deleteVideo,
  fetchTranscript,
  fetchVideo,
  requestRender,
  requestTranscription,
  startVideo,
  unlockVideo,
  updateVideo,
} from './video-api'

function mockFetch(...responses: Response[]) {
  const fn = vi.fn(async () => responses.shift() ?? Response.json({}, { status: 500 }))
  vi.stubGlobal('fetch', fn)
  return fn
}

const okJson = (data: unknown, status = 200) => Response.json({ data, error: null }, { status })
const errJson = (code: string, status: number) =>
  Response.json({ data: null, error: { code, message: code } }, { status })

afterEach(() => vi.unstubAllGlobals())

describe('startVideo', () => {
  it('creates the video and returns its id and share link', async () => {
    const fetch = mockFetch(okJson({ video: { id: 'v1' }, shareUrl: 'http://x/v/v1' }, 201))
    await expect(startVideo('Demo')).resolves.toEqual({ id: 'v1', shareUrl: 'http://x/v/v1' })
    expect(fetch).toHaveBeenCalledWith('/api/videos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Demo' }),
    })
  })

  it('throws an UploadError carrying the API error code', async () => {
    mockFetch(errJson('workspace.forbidden', 403))
    await expect(startVideo('Demo')).rejects.toMatchObject({ code: 'workspace.forbidden' })
  })
})

describe('createUploadApi', () => {
  const api = createUploadApi('v1')
  const request = { kind: 'media', index: 2, startMs: 8000, byteLength: 10, sha256: 'h' } as const

  it('prepares, confirms and completes through the video endpoints', async () => {
    const fetch = mockFetch(
      okJson({ url: 'http://storage/put' }),
      okJson({ confirmed: true }),
      okJson({ id: 'v1' }),
    )
    await expect(api.prepare(request)).resolves.toEqual({ url: 'http://storage/put' })
    await api.confirm({ kind: 'media', index: 2 })
    await api.complete({ durationMs: 9000, segmentCount: 3 })

    expect(fetch.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      '/api/videos/v1/segments',
      '/api/videos/v1/segments/confirm',
      '/api/videos/v1/complete',
    ])
  })

  it.each([
    [503, true],
    [500, true],
    [429, true],
    [401, false],
    [409, false],
    [400, false],
  ])('marks HTTP %i as retryable=%s', async (status, retryable) => {
    mockFetch(errJson('x', status))
    const error = await api.prepare(request).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UploadError)
    expect(error).toMatchObject({ retryable, status })
  })

  it('treats network failures as retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    )
    await expect(api.confirm({ kind: 'init', index: 0 })).rejects.toMatchObject({ retryable: true })
  })
})

describe('deleteVideo', () => {
  it('sends a DELETE without a body', async () => {
    const fetch = mockFetch(okJson({ deleted: true }))
    await deleteVideo('v/1')
    expect(fetch).toHaveBeenCalledWith('/api/videos/v%2F1', { method: 'DELETE' })
  })
})

describe('video management calls', () => {
  it('sends edits, render retries, reads and unlocks to the video endpoints', async () => {
    const fetch = mockFetch(
      okJson({ id: 'v 1', title: 'New' }),
      okJson({ id: 'v 1' }),
      okJson({ id: 'v 1' }),
      okJson({ unlocked: true }),
      okJson({ id: 'v 1' }),
      okJson({ language: 'es', segments: [] }),
    )
    await expect(updateVideo('v 1', { title: 'New', trim: null })).resolves.toMatchObject({
      title: 'New',
    })
    await requestRender('v 1')
    await fetchVideo('v 1')
    await unlockVideo('v 1', 'secret')
    await requestTranscription('v 1')
    await expect(fetchTranscript('/api/videos/v1/transcript')).resolves.toEqual({
      language: 'es',
      segments: [],
    })

    const calls = fetch.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => [init.method, url])).toEqual([
      ['PATCH', '/api/videos/v%201'],
      ['POST', '/api/videos/v%201/render'],
      ['GET', '/api/videos/v%201'],
      ['POST', '/api/videos/v%201/unlock'],
      ['POST', '/api/videos/v%201/transcribe'],
      ['GET', '/api/videos/v1/transcript'],
    ])
    expect(calls[0]?.[1].body).toBe(JSON.stringify({ title: 'New', trim: null }))
    expect(calls[3]?.[1].body).toBe(JSON.stringify({ password: 'secret' }))
  })

  it('surfaces wrong passwords as their API code', async () => {
    mockFetch(errJson('video.password_incorrect', 403))
    await expect(unlockVideo('v1', 'nope')).rejects.toMatchObject({
      code: 'video.password_incorrect',
      retryable: false,
    })
  })
})

describe('discussion calls', () => {
  it('reads and writes comments and reactions', async () => {
    const fetch = mockFetch(
      okJson({ comments: [], reactions: [] }),
      okJson({ id: 'c1' }, 201),
      okJson({ id: 'c1' }),
      okJson({ deleted: true }),
      okJson({ id: 'r1' }, 201),
    )
    await fetchDiscussion('v1')
    await addComment('v1', { body: 'Hi', timestampMs: 1000 })
    await editComment('v1', 'c 1', 'Hey')
    await deleteComment('v1', 'c 1')
    await addReaction('v1', '🔥', 2000)
    const calls = fetch.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => [init.method, url, init.body])).toEqual([
      ['GET', '/api/videos/v1/discussion', undefined],
      ['POST', '/api/videos/v1/comments', JSON.stringify({ body: 'Hi', timestampMs: 1000 })],
      ['PATCH', '/api/videos/v1/comments/c%201', JSON.stringify({ body: 'Hey' })],
      ['DELETE', '/api/videos/v1/comments/c%201', undefined],
      ['POST', '/api/videos/v1/reactions', JSON.stringify({ emoji: '🔥', timestampMs: 2000 })],
    ])
  })
})
