import { beforeEach, describe, expect, it } from 'vitest'
import { createTestBed } from './test-bed'
import { RequestRender, UpdateVideo } from './video-management'

describe('video management', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  const update = (
    input: Omit<Parameters<UpdateVideo['execute']>[0], 'userId'>,
    userId = 'owner_1',
  ) => new UpdateVideo(bed.deps).execute({ userId, ...input })

  beforeEach(async () => {
    bed = await createTestBed()
  })

  describe('UpdateVideo', () => {
    it('renames and changes privacy', async () => {
      const video = await bed.recorded()
      const updated = await update({ videoId: video.id, title: '  Q4 plan ', privacy: 'private' })
      expect(updated).toMatchObject({ title: 'Q4 plan', privacy: 'private', passwordHash: null })
    })

    it('only lets the owner edit', async () => {
      const video = await bed.recorded()
      await expect(update({ videoId: video.id, title: 'x' }, 'member_1')).rejects.toMatchObject({
        code: 'video.forbidden',
      })
    })

    it('stores a password hash only while the video is password protected', async () => {
      const video = await bed.recorded()
      await expect(update({ videoId: video.id, privacy: 'password' })).rejects.toMatchObject({
        code: 'video.password_missing',
      })
      await expect(
        update({ videoId: video.id, privacy: 'password', password: 'abc' }),
      ).rejects.toMatchObject({ code: 'video.password_invalid_length' })

      const locked = await update({ videoId: video.id, privacy: 'password', password: 'abcd' })
      expect(locked.passwordHash).toBe('hashed:abcd')
      // Renaming keeps the existing password.
      expect((await update({ videoId: video.id, title: 'New' })).passwordHash).toBe('hashed:abcd')
      expect((await update({ videoId: video.id, privacy: 'link' })).passwordHash).toBeNull()
    })

    it('re-renders when the trim changes, and not otherwise', async () => {
      const video = await bed.recorded()
      expect(bed.renders.jobs).toHaveLength(1)

      const trimmed = await update({ videoId: video.id, trim: { startMs: 500, endMs: 4500 } })
      expect(trimmed).toMatchObject({
        trim: { startMs: 500, endMs: 4500 },
        renderState: 'queued',
        renderVersion: 2,
      })
      await update({ videoId: video.id, trim: { startMs: 500, endMs: 4500 }, title: 'Same trim' })
      expect(bed.renders.jobs).toHaveLength(2)

      const untrimmed = await update({ videoId: video.id, trim: null })
      expect(untrimmed.trim).toBeNull()
      expect(bed.renders.jobs.at(-1)).toEqual({ videoId: video.id, version: 3 })
    })

    it('rejects trims while recording and outside the recording', async () => {
      const recording = await bed.start()
      await expect(
        update({ videoId: recording.id, trim: { startMs: 0, endMs: 2000 } }),
      ).rejects.toMatchObject({ code: 'video.not_ready' })

      const video = await bed.recorded()
      await expect(
        update({ videoId: video.id, trim: { startMs: 0, endMs: 9000 } }),
      ).rejects.toMatchObject({ code: 'video.trim_invalid' })
    })
  })

  describe('RequestRender', () => {
    it('queues a new render of a finished video', async () => {
      const video = await bed.recorded()
      const retried = await new RequestRender(bed.deps).execute({
        userId: 'owner_1',
        videoId: video.id,
      })
      expect(retried).toMatchObject({ renderState: 'queued', renderVersion: 2 })
    })

    it('refuses while recording', async () => {
      const video = await bed.start()
      await expect(
        new RequestRender(bed.deps).execute({ userId: 'owner_1', videoId: video.id }),
      ).rejects.toMatchObject({ code: 'video.not_ready' })
    })
  })
})
