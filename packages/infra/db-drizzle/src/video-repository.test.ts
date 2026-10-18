import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import {
  CompleteRecording,
  ConfirmSegmentUpload,
  createVideo,
  GetPlayback,
  PrepareSegmentUpload,
  RenderVideo,
  StartRecording,
  TranscribeVideo,
  UpdateVideo,
  type VideoSegment,
} from '@weft/core'
import {
  FAKE_RENDER_OUTPUT,
  FakeAccessTokens,
  FakeMediaRenderer,
  FakeObjectStorage,
  FakePasswordHasher,
  FakeRenderQueue,
  FakeSpeechRecognizer,
  FAKE_TRANSCRIPT_SEGMENTS,
  FixedClock,
  SequentialIdGenerator,
} from '@weft/core/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { connectDatabase, runMigrations, type DatabaseHandle } from './client'
import { users, videoSegments, videos, workspaceMembers, workspaces } from './schema'
import { DrizzleTranscriptRepository } from './transcript-repository'
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

    const ready = {
      ...video,
      status: 'ready' as const,
      durationMs: 8000,
      completedAt: NOW,
      trim: { startMs: 1000, endMs: 7000 },
      privacy: 'password' as const,
      passwordHash: 'hash',
    }
    await repo.update(ready)
    expect(await repo.findById('vid_1')).toEqual(ready)
  })

  it('versions renders and ignores stale results', async () => {
    const video = newVideo()
    await repo.create(video)
    expect(await repo.requestRender('vid_1')).toBe(1)
    expect(await repo.requestRender('vid_1')).toBe(2)
    expect(await repo.requestRender('missing')).toBeNull()

    const render = { ...FAKE_RENDER_OUTPUT, version: 1, trim: null }
    expect(await repo.saveRender('vid_1', 1, { state: 'ready', render })).toBe(false)
    expect(await repo.saveRender('vid_1', 2, { state: 'processing' })).toBe(true)
    expect(
      await repo.saveRender('vid_1', 2, { state: 'ready', render: { ...render, version: 2 } }),
    ).toBe(true)

    // Owner edits never overwrite render progress.
    await repo.update({ ...video, title: 'Renamed' })
    expect(await repo.findById('vid_1')).toMatchObject({
      title: 'Renamed',
      renderState: 'ready',
      renderVersion: 2,
      render: { ...render, version: 2 },
    })
  })

  it("lists a workspace's videos newest first", async () => {
    const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
    for (const [id, minutes] of [
      ['a', 0],
      ['b', 2],
      ['c', 1],
    ] as const) {
      await repo.create(
        createVideo({ id, workspaceId: 'ws_1', ownerId: 'user_1', title: id, now: at(minutes) }),
      )
    }
    expect(
      (await repo.listForWorkspace('ws_1', { limit: 10, trashed: false })).map((v) => v.id),
    ).toEqual(['b', 'c', 'a'])
    expect(await repo.listForWorkspace('ws_1', { limit: 1, trashed: false })).toHaveLength(1)
    expect(await repo.listForWorkspace('other', { limit: 10, trashed: false })).toEqual([])
  })

  it('enforces that a password exists exactly when the video is password protected', async () => {
    await repo.create(newVideo())
    await expect(
      repo.update({ ...newVideo(), privacy: 'password', passwordHash: null }),
    ).rejects.toThrow()
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

  it('deletes a video together with its segments', async () => {
    await repo.create(newVideo())
    await repo.upsertSegment(segment())
    await repo.delete('vid_1')
    expect(await repo.findById('vid_1')).toBeNull()
    expect(await repo.listSegments('vid_1')).toEqual([])
  })

  it('supports the full recording flow through the use cases', async () => {
    const storage = new FakeObjectStorage()
    const renders = new FakeRenderQueue()
    const deps = {
      videos: repo,
      workspaces: new DrizzleWorkspaceRepository(handle.db),
      storage,
      renders,
      transcriptions: renders,
      transcripts: new DrizzleTranscriptRepository(handle.db),
      recognizer: new FakeSpeechRecognizer(),
      renderer: new FakeMediaRenderer(storage),
      passwords: new FakePasswordHasher(),
      accessTokens: new FakeAccessTokens(),
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

    // Trim, then let the worker render it.
    const trim = { startMs: 1000, endMs: 5000 }
    await new UpdateVideo(deps).execute({ userId: 'user_1', videoId: video.id, trim })
    for (const job of renders.jobs) await new RenderVideo(deps).execute(job)
    const rendered = await new GetPlayback(deps).execute({ viewerId: null, videoId: video.id })
    expect(rendered.source).toEqual({
      kind: 'render',
      render: { ...FAKE_RENDER_OUTPUT, version: 2, trim },
    })

    // The render (the first job went stale) queued a transcription of its timeline.
    for (const job of renders.transcriptionJobs) await new TranscribeVideo(deps).execute(job)
    const transcript = await (
      await new GetPlayback(deps).execute({ viewerId: null, videoId: video.id })
    ).transcript()
    expect(transcript).toMatchObject({
      renderVersion: 2,
      language: 'es',
      segments: FAKE_TRANSCRIPT_SEGMENTS,
    })
    expect(await repo.findById(video.id)).toMatchObject({
      transcriptionState: 'ready',
      transcriptionVersion: 1,
    })
  })

  it('versions transcriptions and keeps the language with owner edits', async () => {
    const video = newVideo()
    await repo.create(video)
    expect(await repo.requestTranscription('vid_1')).toBe(1)
    expect(await repo.requestTranscription('missing')).toBeNull()
    expect(await repo.saveTranscription('vid_1', 2, 'ready')).toBe(false)
    expect(await repo.saveTranscription('vid_1', 1, 'processing')).toBe(true)
    await repo.update({ ...video, transcriptLanguage: 'en', transcriptionState: 'none' })
    expect(await repo.findById('vid_1')).toMatchObject({
      transcriptLanguage: 'en',
      transcriptionState: 'processing',
      transcriptionVersion: 1,
    })
  })

  it("replaces a video's transcript and deletes it with the video", async () => {
    const transcripts = new DrizzleTranscriptRepository(handle.db)
    await repo.create(newVideo())
    const base = {
      videoId: 'vid_1',
      renderVersion: 1,
      language: 'en',
      segments: FAKE_TRANSCRIPT_SEGMENTS,
      createdAt: NOW,
    }
    await transcripts.save(base)
    await transcripts.save({ ...base, renderVersion: 2, language: 'es' })
    expect(await transcripts.find('vid_1')).toEqual({ ...base, renderVersion: 2, language: 'es' })
    await repo.delete('vid_1')
    expect(await transcripts.find('vid_1')).toBeNull()
  })
})
