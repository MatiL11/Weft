import { beforeEach, describe, expect, it } from 'vitest'
import {
  FakeObjectStorage,
  FixedClock,
  InMemoryVideoRepository,
  InMemoryWorkspaceRepository,
  SequentialIdGenerator,
} from '../testing'
import {
  CompleteRecording,
  ConfirmSegmentUpload,
  DeleteVideo,
  GetPlayback,
  PrepareSegmentUpload,
  StartRecording,
} from './recording'

const NOW = new Date('2026-10-16T10:00:00Z')
const SHA = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg='

describe('recording use cases', () => {
  let videos: InMemoryVideoRepository
  let workspaces: InMemoryWorkspaceRepository
  let storage: FakeObjectStorage
  let deps: ConstructorParameters<typeof StartRecording>[0]

  beforeEach(async () => {
    videos = new InMemoryVideoRepository()
    workspaces = new InMemoryWorkspaceRepository()
    storage = new FakeObjectStorage()
    deps = {
      videos,
      workspaces,
      storage,
      ids: new SequentialIdGenerator('vid'),
      clock: new FixedClock(NOW),
    }
    const ws = { id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW }
    await workspaces.createWithMember(ws, 'owner_1', 'owner')
    await workspaces.addMember('ws_1', 'member_1', 'member')
    await workspaces.addMember('ws_1', 'viewer_1', 'viewer')
  })

  async function start(userId = 'owner_1') {
    return new StartRecording(deps).execute({ userId, workspaceId: 'ws_1', title: 'Demo' })
  }

  async function upload(videoId: string, kind: 'init' | 'media', index: number, startMs = 0) {
    const byteLength = 100 + index
    const prepared = await new PrepareSegmentUpload(deps).execute({
      userId: 'owner_1',
      videoId,
      kind,
      index,
      startMs,
      byteLength,
      sha256: SHA,
    })
    storage.simulateUpload(prepared.key, byteLength)
    await new ConfirmSegmentUpload(deps).execute({ userId: 'owner_1', videoId, kind, index })
    return prepared
  }

  describe('StartRecording', () => {
    it('creates a recording video owned by the caller', async () => {
      const video = await start()
      expect(video).toMatchObject({ id: 'vid_1', ownerId: 'owner_1', status: 'recording' })
      expect(await videos.findById('vid_1')).toEqual(video)
    })

    it('lets members record but not viewers or outsiders', async () => {
      await expect(start('member_1')).resolves.toMatchObject({ ownerId: 'member_1' })
      await expect(start('viewer_1')).rejects.toMatchObject({ code: 'workspace.forbidden' })
      await expect(start('stranger')).rejects.toMatchObject({ code: 'workspace.forbidden' })
    })
  })

  describe('PrepareSegmentUpload', () => {
    it('returns a presigned URL bound to the segment checksum and size', async () => {
      const video = await start()
      const prepared = await new PrepareSegmentUpload(deps).execute({
        userId: 'owner_1',
        videoId: video.id,
        kind: 'media',
        index: 3,
        startMs: 12_000,
        byteLength: 2048,
        sha256: SHA,
      })
      expect(prepared).toEqual({
        key: 'videos/vid_1/seg-000003.m4s',
        url: `fake-put://videos/vid_1/seg-000003.m4s?len=2048&sha=${SHA}`,
        expiresAt: new Date(NOW.getTime() + 10 * 60_000),
      })
      expect(await videos.listSegments(video.id)).toEqual([
        expect.objectContaining({ kind: 'media', index: 3, startMs: 12_000, uploadedAt: null }),
      ])
    })

    it('only lets the owner upload, and only while recording', async () => {
      const video = await start()
      const input = {
        videoId: video.id,
        kind: 'init',
        index: 0,
        startMs: 0,
        byteLength: 10,
        sha256: SHA,
      } as const
      await expect(
        new PrepareSegmentUpload(deps).execute({ ...input, userId: 'member_1' }),
      ).rejects.toMatchObject({ code: 'video.forbidden' })

      await upload(video.id, 'init', 0)
      await upload(video.id, 'media', 0)
      await new CompleteRecording(deps).execute({
        userId: 'owner_1',
        videoId: video.id,
        durationMs: 3000,
        segmentCount: 1,
      })
      await expect(
        new PrepareSegmentUpload(deps).execute({ ...input, userId: 'owner_1' }),
      ).rejects.toMatchObject({ code: 'video.not_recording' })
    })

    it('reports unknown videos', async () => {
      await expect(
        new PrepareSegmentUpload(deps).execute({
          userId: 'owner_1',
          videoId: 'nope',
          kind: 'init',
          index: 0,
          startMs: 0,
          byteLength: 1,
          sha256: SHA,
        }),
      ).rejects.toMatchObject({ code: 'video.not_found' })
    })
  })

  describe('ConfirmSegmentUpload', () => {
    it('marks the segment uploaded only if the object exists with the declared size', async () => {
      const video = await start()
      const prepared = await new PrepareSegmentUpload(deps).execute({
        userId: 'owner_1',
        videoId: video.id,
        kind: 'media',
        index: 0,
        startMs: 0,
        byteLength: 500,
        sha256: SHA,
      })
      const confirm = () =>
        new ConfirmSegmentUpload(deps).execute({
          userId: 'owner_1',
          videoId: video.id,
          kind: 'media',
          index: 0,
        })

      await expect(confirm()).rejects.toMatchObject({ code: 'video.segment_not_uploaded' })
      storage.simulateUpload(prepared.key, 499)
      await expect(confirm()).rejects.toMatchObject({ code: 'video.segment_not_uploaded' })
      storage.simulateUpload(prepared.key, 500)
      await confirm()

      expect((await videos.listSegments(video.id))[0]?.uploadedAt).toEqual(NOW)
    })

    it('rejects confirming a segment that was never prepared', async () => {
      const video = await start()
      await expect(
        new ConfirmSegmentUpload(deps).execute({
          userId: 'owner_1',
          videoId: video.id,
          kind: 'media',
          index: 4,
        }),
      ).rejects.toMatchObject({ code: 'video.segment_unknown' })
    })
  })

  describe('CompleteRecording', () => {
    it('marks the video ready when every segment arrived', async () => {
      const video = await start()
      await upload(video.id, 'init', 0)
      await upload(video.id, 'media', 0, 0)
      await upload(video.id, 'media', 1, 4000)

      const done = await new CompleteRecording(deps).execute({
        userId: 'owner_1',
        videoId: video.id,
        durationMs: 7500,
        segmentCount: 2,
      })
      expect(done).toMatchObject({ status: 'ready', durationMs: 7500, completedAt: NOW })
    })

    it('refuses to complete with missing segments and names them', async () => {
      const video = await start()
      await upload(video.id, 'init', 0)
      await upload(video.id, 'media', 0)
      await upload(video.id, 'media', 2, 8000)

      await expect(
        new CompleteRecording(deps).execute({
          userId: 'owner_1',
          videoId: video.id,
          durationMs: 11000,
          segmentCount: 3,
        }),
      ).rejects.toMatchObject({
        code: 'video.segments_missing',
        message: expect.stringContaining('1'),
      })
    })

    it('requires the init segment and at least one media segment', async () => {
      const video = await start()
      await upload(video.id, 'media', 0)
      await expect(
        new CompleteRecording(deps).execute({
          userId: 'owner_1',
          videoId: video.id,
          durationMs: 1000,
          segmentCount: 1,
        }),
      ).rejects.toMatchObject({ code: 'video.segments_missing' })
      await expect(
        new CompleteRecording(deps).execute({
          userId: 'owner_1',
          videoId: video.id,
          durationMs: 0,
          segmentCount: 0,
        }),
      ).rejects.toMatchObject({ code: 'video.segments_missing' })
    })
  })

  describe('GetPlayback', () => {
    it('returns the playable timeline and presigned media URLs', async () => {
      const video = await start()
      await upload(video.id, 'init', 0)
      await upload(video.id, 'media', 0, 0)
      await upload(video.id, 'media', 1, 4000)

      const live = await new GetPlayback(deps).execute({ viewerId: null, videoId: video.id })
      expect(live.ended).toBe(false)
      expect(live.segments.map((s) => s.index)).toEqual([0])

      await new CompleteRecording(deps).execute({
        userId: 'owner_1',
        videoId: video.id,
        durationMs: 6000,
        segmentCount: 2,
      })
      const ended = await new GetPlayback(deps).execute({ viewerId: null, videoId: video.id })
      expect(ended.ended).toBe(true)
      expect(ended.segments).toEqual([
        { index: 0, durationMs: 4000 },
        { index: 1, durationMs: 2000 },
      ])
      expect(await ended.mediaUrl('media', 1)).toBe('fake-get://videos/vid_1/seg-000001.m4s')
    })

    it('enforces privacy', async () => {
      const video = await start()
      await videos.update({ ...video, privacy: 'workspace' })
      await expect(
        new GetPlayback(deps).execute({ viewerId: null, videoId: video.id }),
      ).rejects.toMatchObject({ code: 'video.not_found' })
      await expect(
        new GetPlayback(deps).execute({ viewerId: 'viewer_1', videoId: video.id }),
      ).resolves.toBeDefined()
    })
  })

  describe('DeleteVideo', () => {
    it('removes the video, its segments and its stored media', async () => {
      const video = await start()
      await upload(video.id, 'init', 0)
      await upload(video.id, 'media', 0)

      await new DeleteVideo(deps).execute({ userId: 'owner_1', videoId: video.id })

      expect(await videos.findById(video.id)).toBeNull()
      expect(await videos.listSegments(video.id)).toEqual([])
      expect(storage.keys()).toEqual([])
    })

    it('only lets the owner delete', async () => {
      const video = await start()
      await expect(
        new DeleteVideo(deps).execute({ userId: 'member_1', videoId: video.id }),
      ).rejects.toMatchObject({ code: 'video.forbidden' })
      expect(await videos.findById(video.id)).not.toBeNull()
    })
  })
})
