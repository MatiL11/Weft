import { describe, expect, it } from 'vitest'
import { DomainError } from './errors'
import {
  accessFor,
  canView,
  createVideo,
  MAX_MEDIA_SEGMENTS,
  MAX_SEGMENT_BYTES,
  segmentKey,
  validateSegmentUpload,
} from './video'

const NOW = new Date('2026-10-16T10:00:00Z')
const SHA = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg='

function video(overrides = {}) {
  return {
    ...createVideo({
      id: 'vid_1',
      workspaceId: 'ws_1',
      ownerId: 'user_1',
      title: 'Demo',
      now: NOW,
    }),
    ...overrides,
  }
}

describe('createVideo', () => {
  it('starts recording, shareable by link, with a trimmed title', () => {
    expect(
      createVideo({ id: 'v', workspaceId: 'w', ownerId: 'u', title: '  Q4 demo ', now: NOW }),
    ).toEqual({
      id: 'v',
      workspaceId: 'w',
      ownerId: 'u',
      title: 'Q4 demo',
      status: 'recording',
      privacy: 'link',
      createdAt: NOW,
      completedAt: null,
      durationMs: null,
      trim: null,
      passwordHash: null,
      renderState: 'none',
      renderVersion: 0,
      render: null,
    })
  })

  it.each(['', '   ', 'x'.repeat(121)])('rejects title %j', (title) => {
    expect(() =>
      createVideo({ id: 'v', workspaceId: 'w', ownerId: 'u', title, now: NOW }),
    ).toThrowError(expect.objectContaining({ code: 'video.title_invalid' }))
  })
})

describe('validateSegmentUpload', () => {
  const valid = { kind: 'media', index: 0, startMs: 0, byteLength: 1024, sha256: SHA } as const

  it('accepts a valid media segment and an init segment', () => {
    expect(() => validateSegmentUpload(valid)).not.toThrow()
    expect(() => validateSegmentUpload({ ...valid, kind: 'init', index: 0 })).not.toThrow()
  })

  it.each([
    [{ index: -1 }, 'video.segment_index_invalid'],
    [{ index: 1.5 }, 'video.segment_index_invalid'],
    [{ index: MAX_MEDIA_SEGMENTS }, 'video.segment_index_invalid'],
    [{ kind: 'init', index: 1 }, 'video.segment_index_invalid'],
    [{ startMs: -1 }, 'video.segment_start_invalid'],
    [{ byteLength: 0 }, 'video.segment_size_invalid'],
    [{ byteLength: MAX_SEGMENT_BYTES + 1 }, 'video.segment_size_invalid'],
    [{ sha256: 'not-a-hash' }, 'video.segment_checksum_invalid'],
    [{ kind: 'thumbnail' }, 'video.segment_kind_invalid'],
  ])('rejects %j with %s', (patch, code) => {
    expect(() => validateSegmentUpload({ ...valid, ...patch } as never)).toThrowError(
      expect.objectContaining({ code }),
    )
  })

  it('throws DomainError instances', () => {
    expect(() => validateSegmentUpload({ ...valid, index: -1 })).toThrow(DomainError)
  })
})

describe('segmentKey', () => {
  it('lays out objects per video', () => {
    expect(segmentKey('vid_1', 'init', 0)).toBe('videos/vid_1/init.mp4')
    expect(segmentKey('vid_1', 'media', 7)).toBe('videos/vid_1/seg-000007.m4s')
  })
})

describe('canView', () => {
  it('lets anyone watch a link-shared video', () => {
    expect(canView(video(), { userId: null, role: null })).toBe(true)
  })

  it('restricts workspace videos to members', () => {
    const v = video({ privacy: 'workspace' })
    expect(canView(v, { userId: 'user_2', role: 'viewer' })).toBe(true)
    expect(canView(v, { userId: 'user_9', role: null })).toBe(false)
    expect(canView(v, { userId: null, role: null })).toBe(false)
  })

  it('restricts private videos to the owner', () => {
    const v = video({ privacy: 'private' })
    expect(canView(v, { userId: 'user_1', role: 'owner' })).toBe(true)
    expect(canView(v, { userId: 'user_2', role: 'admin' })).toBe(false)
  })
})

describe('accessFor', () => {
  const anonymous = { userId: null, role: null }

  it('always lets the owner in', () => {
    for (const privacy of ['link', 'workspace', 'password', 'private'] as const) {
      expect(accessFor(video({ privacy }), { userId: 'user_1', role: null })).toBe('granted')
    }
  })

  it('asks for the password until the viewer unlocks the video', () => {
    const protectedVideo = video({ privacy: 'password' })
    expect(accessFor(protectedVideo, anonymous)).toBe('password_required')
    expect(accessFor(protectedVideo, { userId: 'other', role: 'member' })).toBe('password_required')
    expect(accessFor(protectedVideo, { ...anonymous, unlocked: true })).toBe('granted')
  })

  it('hides workspace videos from outsiders and private videos from everyone else', () => {
    expect(accessFor(video({ privacy: 'workspace' }), anonymous)).toBe('hidden')
    expect(accessFor(video({ privacy: 'workspace' }), { userId: 'm', role: 'viewer' })).toBe(
      'granted',
    )
    expect(accessFor(video({ privacy: 'private' }), { userId: 'm', role: 'admin' })).toBe('hidden')
  })
})
