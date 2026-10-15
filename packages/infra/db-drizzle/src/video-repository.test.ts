import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import {
  CompleteRecording,
  ConfirmSegmentUpload,
  createVideo,
  GetPlayback,
  PrepareSegmentUpload,
  StartRecording,
  type VideoSegment,
} from '@weft/core'
import { FakeObjectStorage, FixedClock, SequentialIdGenerator } from '@weft/core/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { connectDatabase, runMigrations, type DatabaseHandle } from './client'
import { users, videoSegments, videos, workspaceMembers, workspaces } from './schema'
import { DrizzleVideoRepository } from './video-repository'
import { DrizzleWorkspaceRepository } from './workspace-repository'

const NOW = new Date('2026-10-16T10:00:00.000Z')
const SHA = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg='

function segment(overrides: Partial<VideoSegment> = {}): VideoSegment {
  return {
    videoId: 'vid_1',
    kind: 'media',
    index: 0,
    startMs: 0,
    byteLength: 1000,
    sha256: SHA,
    uploadedAt: null,
    ...overrides,
  }
}

describe('DrizzleVideoRepository (integration)', () => {
  let container: StartedPostgreSqlContainer
  let handle: DatabaseHandle
  let repo: DrizzleVideoRepository

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    await runMigrations(container.getConnectionUri())
    handle = connectDatabase(container.getConnectionUri())
    repo = new DrizzleVideoRepository(handle.db)
  })

  afterAll(async () => {
    await handle?.close()
    await container?.stop()
  })

  beforeEach(async () => {
    await handle.db.delete(videoSegments)
    await handle.db.delete(videos)
    await handle.db.delete(workspaceMembers)
    await handle.db.delete(workspaces)
    await handle.db.delete(users)
    await handle.db.insert(users).values({ id: 'user_1', name: 'Ana', email: 'ana@example.com' })
    await new DrizzleWorkspaceRepository(handle.db).createWithMember(
      { id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW },
      'user_1',
      'owner',
    )
  })

  const newVideo = () =>
    createVideo({ id: 'vid_1', workspaceId: 'ws_1', ownerId: 'user_1', title: 'Demo', now: NOW })

  it('creates, reads and updates videos', async () => {
    const video = newVideo()
    await repo.create(video)
    expect(await repo.findById('vid_1')).toEqual(video)
    expect(await repo.findById('missing')).toBeNull()

    const ready = { ...video, status: 'ready' as const, durationMs: 8000, completedAt: NOW }
    await repo.update(ready)
    expect(await repo.findById('vid_1')).toEqual(ready)
  })

  it('upserts segments, resetting their upload state when re-prepared', async () => {
    await repo.create(newVideo())
    await repo.upsertSegment(segment({ index: 0, byteLength: 1000 }))
    await repo.markSegmentUploaded('vid_1', 'media', 0, NOW)
    expect((await repo.findSegment('vid_1', 'media', 0))?.uploadedAt).toEqual(NOW)

    await repo.upsertSegment(segment({ index: 0, byteLength: 1200 }))
    expect(await repo.findSegment('vid_1', 'media', 0)).toEqual(
      segment({ index: 0, byteLength: 1200, uploadedAt: null }),
    )
    expect(await repo.findSegment('vid_1', 'init', 0)).toBeNull()
  })

  it('keeps init and media segments apart and lists them per video', async () => {
    await repo.create(newVideo())
    await repo.upsertSegment(segment({ kind: 'init', index: 0 }))
    await repo.upsertSegment(segment({ kind: 'media', index: 0 }))
    await repo.upsertSegment(segment({ kind: 'media', index: 1, startMs: 4000 }))

    const listed = await repo.listSegments('vid_1')
    expect(listed).toHaveLength(3)
    expect(await repo.listSegments('other')).toEqual([])
  })

  it('deletes segments with their video', async () => {
    await repo.create(newVideo())
    await repo.upsertSegment(segment())
    await handle.db.delete(videos)
    expect(await repo.listSegments('vid_1')).toEqual([])
  })

  it('supports the full recording flow through the use cases', async () => {
    const storage = new FakeObjectStorage()
    const deps = {
      videos: repo,
      workspaces: new DrizzleWorkspaceRepository(handle.db),
      storage,
      ids: new SequentialIdGenerator('vid'),
      clock: new FixedClock(NOW),
    }
    const video = await new StartRecording(deps).execute({
      userId: 'user_1',
      workspaceId: 'ws_1',
      title: 'Demo',
    })
    for (const [kind, index, startMs] of [
      ['init', 0, 0],
      ['media', 0, 0],
      ['media', 1, 4000],
    ] as const) {
      const prepared = await new PrepareSegmentUpload(deps).execute({
        userId: 'user_1',
        videoId: video.id,
        kind,
        index,
        startMs,
        byteLength: 500,
        sha256: SHA,
      })
      storage.simulateUpload(prepared.key, 500)
      await new ConfirmSegmentUpload(deps).execute({
        userId: 'user_1',
        videoId: video.id,
        kind,
        index,
      })
    }
    await new CompleteRecording(deps).execute({
      userId: 'user_1',
      videoId: video.id,
      durationMs: 6000,
      segmentCount: 2,
    })

    const playback = await new GetPlayback(deps).execute({ viewerId: null, videoId: video.id })
    expect(playback.ended).toBe(true)
    expect(playback.segments).toEqual([
      { index: 0, durationMs: 4000 },
      { index: 1, durationMs: 2000 },
    ])
  })
})
