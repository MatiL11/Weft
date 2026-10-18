import { describe, expect, it } from 'vitest'
import {
  applyEvent,
  initialOf,
  threads,
  timelineMarkers,
  type CommentView,
  type Discussion,
} from './discussion'

const comment = (id: string, extra: Partial<CommentView> = {}): CommentView => ({
  id,
  parentId: null,
  author: { id: 'u1', name: 'Ana' },
  body: `Comment ${id}`,
  timestampMs: 1000,
  createdAt: '2026-10-17T10:00:00.000Z',
  editedAt: null,
  deleted: false,
  ...extra,
})
const empty: Discussion = { viewerId: 'u1', canModerate: false, comments: [], reactions: [] }

describe('discussion', () => {
  it('applies live events idempotently', () => {
    const created = applyEvent(empty, { type: 'comment.created', comment: comment('a') })
    expect(
      applyEvent(created, { type: 'comment.created', comment: comment('a') }).comments,
    ).toHaveLength(1)
    const edited = applyEvent(created, {
      type: 'comment.updated',
      comment: comment('a', { body: 'Edited' }),
    })
    expect(edited.comments[0]?.body).toBe('Edited')
    const deleted = applyEvent(edited, { type: 'comment.deleted', commentId: 'a' })
    expect(deleted.comments[0]).toMatchObject({ body: '', deleted: true })

    const reaction = { id: 'r', emoji: '🔥', timestampMs: 10, createdAt: '' }
    const reacted = applyEvent(empty, { type: 'reaction.created', reaction })
    expect(applyEvent(reacted, { type: 'reaction.created', reaction })).toBe(reacted)
  })

  it('builds threads, keeping deleted comments only while they have replies', () => {
    const list = [
      comment('a'),
      comment('b', { deleted: true, body: '' }),
      comment('c', { deleted: true, body: '' }),
      comment('a1', { parentId: 'a' }),
      comment('c1', { parentId: 'c' }),
      comment('a2', { parentId: 'a', deleted: true }),
    ]
    expect(threads(list).map((t) => [t.comment.id, t.replies.map((r) => r.id)])).toEqual([
      ['a', ['a1']],
      ['c', ['c1']],
    ])
  })

  it('merges nearby markers and skips those outside the video', () => {
    const markers = timelineMarkers(
      {
        comments: [
          comment('a', { timestampMs: 1000 }),
          comment('b', { timestampMs: 1100, author: { id: 'u2', name: 'beto' } }),
          comment('c', { timestampMs: null }),
          comment('r', { timestampMs: 5000, parentId: 'a' }),
          comment('d', { timestampMs: 9000, deleted: true }),
        ],
        reactions: [
          { id: '1', emoji: '🔥', timestampMs: 5000, createdAt: '' },
          { id: '2', emoji: '👍', timestampMs: 99_999, createdAt: '' },
          { id: '3', emoji: '🔥', timestampMs: null, createdAt: '' },
        ],
      },
      10_000,
      10,
    )
    expect(markers).toEqual([
      { position: 0.15, kind: 'comment', label: 'A', count: 2 },
      { position: 0.55, kind: 'reaction', label: '🔥', count: 1 },
    ])
    expect(timelineMarkers({ comments: [comment('a')], reactions: [] }, 0)).toEqual([])
  })

  it('takes the first letter of a name', () => {
    expect(initialOf(' émilie')).toBe('É')
    expect(initialOf('')).toBe('?')
  })
})
