import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { createVideo, type View } from '@weft/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectDatabase, runMigrations, type DatabaseHandle } from './client'
import { users } from './schema'
import { DrizzleVideoRepository } from './video-repository'
import { DrizzleViewRepository } from './view-repository'
import { DrizzleWorkspaceRepository } from './workspace-repository'

const NOW = new Date('2026-10-18T10:00:00.000Z')
const at = (s: number) => new Date(NOW.getTime() + s * 1000)

describe('DrizzleViewRepository (integration)', () => {
  let container: StartedPostgreSqlContainer
  let handle: DatabaseHandle

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    await runMigrations(container.getConnectionUri())
    handle = connectDatabase(container.getConnectionUri())
  })

  afterAll(async () => {
    await handle?.close()
    await container?.stop()
  })

  it('stores views, updates progress, lists newest first and counts per video', async () => {
    await handle.db.insert(users).values({ id: 'u1', name: 'Ana', email: 'ana@example.com' })
    await new DrizzleWorkspaceRepository(handle.db).createWithMember(
      { id: 'ws', name: 'Acme', slug: 'acme', createdAt: NOW },
      'u1',
      'owner',
    )
    const videos = new DrizzleVideoRepository(handle.db)
    for (const id of ['a', 'b', 'c']) {
      await videos.create(
        createVideo({ id, workspaceId: 'ws', ownerId: 'u1', title: id, now: NOW }),
      )
    }
    const repo = new DrizzleViewRepository(handle.db)
    const view = (id: string, videoId: string, seconds: number): View => ({
      id,
      videoId,
      viewerId: id === 'v1' ? 'u1' : null,
      anonymousId: id === 'v1' ? null : 'anon',
      timelineKey: 'full',
      buckets: 0,
      watchedMs: 0,
      startedAt: at(seconds),
      lastSeenAt: at(seconds),
    })
    await repo.create(view('v1', 'a', 1))
    await repo.create(view('v2', 'a', 2))
    await repo.create(view('v3', 'b', 3))

    await repo.update({ ...view('v1', 'a', 1), buckets: 0b111, watchedMs: 4200, lastSeenAt: at(9) })
    expect(await repo.findById('v1')).toMatchObject({
      buckets: 7,
      watchedMs: 4200,
      lastSeenAt: at(9),
    })
    expect(await repo.findById('nope')).toBeNull()
    expect((await repo.listForVideo('a', { limit: 10 })).map((v) => v.id)).toEqual(['v2', 'v1'])
    expect(await repo.countForVideos(['a', 'b', 'c'])).toEqual(
      new Map([
        ['a', 2],
        ['b', 1],
      ]),
    )
    expect(await repo.countForVideos([])).toEqual(new Map())
  })
})
