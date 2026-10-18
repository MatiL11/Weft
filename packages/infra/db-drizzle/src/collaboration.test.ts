import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { createVideo, type VideoEvent } from '@weft/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { connectDatabase, runMigrations, type DatabaseHandle } from './client'
import { DrizzleCommentRepository, DrizzleReactionRepository } from './collaboration-repositories'
import { comments, reactions, users, videos, workspaceMembers, workspaces } from './schema'
import { DrizzleVideoRepository } from './video-repository'
import { PostgresVideoEvents } from './video-events'
import { DrizzleWorkspaceRepository } from './workspace-repository'

const NOW = new Date('2026-10-17T10:00:00.000Z')
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000)

const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise((r) => setTimeout(r, 50))
  if (!condition()) throw new Error('timed out')
}

describe('comments, reactions and live events (integration)', () => {
  let container: StartedPostgreSqlContainer
  let handle: DatabaseHandle
  let other: DatabaseHandle
  let commentRepo: DrizzleCommentRepository
  let reactionRepo: DrizzleReactionRepository

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    await runMigrations(container.getConnectionUri())
    handle = connectDatabase(container.getConnectionUri())
    // A second connection pool stands in for another API instance.
    other = connectDatabase(container.getConnectionUri())
    commentRepo = new DrizzleCommentRepository(handle.db)
    reactionRepo = new DrizzleReactionRepository(handle.db)
  })

  afterAll(async () => {
    await other?.close()
    await handle?.close()
    await container?.stop()
  })

  beforeEach(async () => {
    for (const table of [reactions, comments, videos, workspaceMembers, workspaces, users]) {
      await handle.db.delete(table)
    }
    await handle.db.insert(users).values([
      { id: 'u1', name: 'Ana', email: 'ana@example.com' },
      { id: 'u2', name: 'Beto', email: 'beto@example.com' },
    ])
    await new DrizzleWorkspaceRepository(handle.db).createWithMember(
      { id: 'ws', name: 'Acme', slug: 'acme', createdAt: NOW },
      'u1',
      'owner',
    )
    await new DrizzleVideoRepository(handle.db).create(
      createVideo({ id: 'v1', workspaceId: 'ws', ownerId: 'u1', title: 'Demo', now: NOW }),
    )
  })

  const comment = (id: string, extra = {}) => ({
    id,
    videoId: 'v1',
    authorId: 'u2',
    parentId: null,
    timestampMs: 1500,
    body: `Comment ${id}`,
    createdAt: NOW,
    editedAt: null,
    deletedAt: null,
    ...extra,
  })

  it('stores comments with their authors, in order, and edits them', async () => {
    await commentRepo.create(comment('c2', { createdAt: at(2), authorId: 'u1' }))
    await commentRepo.create(comment('c1', { createdAt: at(1) }))
    await commentRepo.create(comment('r1', { createdAt: at(3), parentId: 'c1', timestampMs: null }))

    const list = await commentRepo.listForVideo('v1')
    expect(list.map((c) => [c.id, c.author.name])).toEqual([
      ['c1', 'Beto'],
      ['c2', 'Ana'],
      ['r1', 'Beto'],
    ])
    await commentRepo.update({
      ...comment('c1', { createdAt: at(1) }),
      body: 'Edited',
      editedAt: at(9),
    })
    expect(await commentRepo.findById('c1')).toMatchObject({
      body: 'Edited',
      editedAt: at(9),
      parentId: null,
    })
    expect(await commentRepo.findById('missing')).toBeNull()
  })

  it('keeps the most recent reactions, oldest first', async () => {
    for (const [id, seconds] of [
      ['a', 1],
      ['b', 3],
      ['c', 2],
    ] as const) {
      await reactionRepo.create({
        id,
        videoId: 'v1',
        userId: null,
        emoji: '🔥',
        timestampMs: 100,
        createdAt: at(seconds),
      })
    }
    expect((await reactionRepo.listForVideo('v1', { limit: 2 })).map((r) => r.id)).toEqual([
      'c',
      'b',
    ])
  })

  it('delivers events published on one instance to subscribers on another', async () => {
    const publisher = new PostgresVideoEvents(handle, commentRepo)
    const errors: unknown[] = []
    const subscriber = new PostgresVideoEvents(other, new DrizzleCommentRepository(other.db), (e) =>
      errors.push(e),
    )
    const received: VideoEvent[] = []
    const unsubscribe = await subscriber.subscribe('v1', (event) => received.push(event))
    const elsewhere: VideoEvent[] = []
    await subscriber.subscribe('v2', (event) => elsewhere.push(event))

    await commentRepo.create(comment('c1'))
    const stored = (await commentRepo.findById('c1'))!
    const reaction = {
      id: 'r',
      videoId: 'v1',
      userId: 'u2',
      emoji: '👏' as const,
      timestampMs: 10,
      createdAt: NOW,
    }
    await publisher.publish({ type: 'comment.created', videoId: 'v1', comment: stored })
    await publisher.publish({ type: 'reaction.created', videoId: 'v1', reaction })
    await publisher.publish({ type: 'comment.deleted', videoId: 'v1', commentId: 'c1' })
    await waitFor(() => received.length === 3)

    expect(received).toEqual([
      { type: 'comment.created', videoId: 'v1', comment: stored },
      { type: 'reaction.created', videoId: 'v1', reaction },
      { type: 'comment.deleted', videoId: 'v1', commentId: 'c1' },
    ])
    expect(elsewhere).toEqual([])

    // Events for comments that vanished meanwhile, or unknown emojis, are dropped.
    await publisher.publish({
      type: 'comment.updated',
      videoId: 'v1',
      comment: { ...stored, id: 'gone' },
    })
    await publisher.publish({
      type: 'reaction.created',
      videoId: 'v1',
      reaction: { ...reaction, emoji: 'x' as never },
    })
    unsubscribe()
    await publisher.publish({ type: 'comment.deleted', videoId: 'v1', commentId: 'c1' })
    await new Promise((r) => setTimeout(r, 300))
    expect(received).toHaveLength(3)
    expect(errors).toEqual([])

    await subscriber.close()
    await subscriber.close()
  })
})
