import { beforeEach, describe, expect, it } from 'vitest'
import {
  CompleteRecording,
  ConfirmSegmentUpload,
  DeleteVideo,
  PrepareSegmentUpload,
} from './recording'
import { createTestBed, NOW, SHA } from './test-bed'

describe('recording use cases', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  let deps: typeof bed.deps
  let videos: typeof bed.videos
  let storage: typeof bed.storage

  beforeEach(async () => {
    bed = await createTestBed()
    ;({ deps, videos, storage } = bed)
  })

  const start = (userId?: string) => bed.start(userId)
  const upload = (...args: Parameters<typeof bed.upload>) => bed.upload(...args)

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
      expect(done).toMatchObject({
        status: 'ready',
        durationMs: 7500,
        completedAt: NOW,
        renderState: 'queued',
        renderVersion: 1,
      })
      expect(bed.renders.jobs).toEqual([{ videoId: video.id, version: 1 }])
    })

    it('stays playable, with a failed render, when the job queue is down', async () => {
      bed.renders.failing = true
      const done = await bed.recorded()
      expect(done).toMatchObject({ status: 'ready', renderState: 'failed' })
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
