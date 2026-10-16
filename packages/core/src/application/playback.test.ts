import { beforeEach, describe, expect, it } from 'vitest'
import { FAKE_RENDER_OUTPUT } from '../testing'
import { GetPlayback, UnlockVideo } from './playback'
import { CompleteRecording } from './recording'
import { RenderVideo } from './rendering'
import { createTestBed } from './test-bed'
import { UpdateVideo } from './video-management'

describe('playback use cases', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  const play = (videoId: string, viewerId: string | null = null, accessToken?: string) =>
    new GetPlayback(bed.deps).execute({ viewerId, videoId, accessToken })

  beforeEach(async () => {
    bed = await createTestBed()
  })

  describe('GetPlayback', () => {
    it('returns the live timeline while recording, then the whole recording', async () => {
      const video = await bed.start()
      await bed.upload(video.id, 'init', 0)
      await bed.upload(video.id, 'media', 0, 0)
      await bed.upload(video.id, 'media', 1, 4000)

      const live = await play(video.id)
      expect(live).toMatchObject({ ended: false, source: { kind: 'raw', skip: null } })
      expect(live.segments.map((s) => s.index)).toEqual([0])

      await new CompleteRecording(bed.deps).execute({
        userId: 'owner_1',
        videoId: video.id,
        durationMs: 6000,
        segmentCount: 2,
      })
      const ended = await play(video.id)
      expect(ended.ended).toBe(true)
      expect(ended.segments).toEqual([
        { index: 0, durationMs: 4000 },
        { index: 1, durationMs: 2000 },
      ])
      expect(await ended.mediaUrl('media', 1)).toBe('fake-get://videos/vid_1/seg-000001.m4s')
    })

    it('serves the render once it exists, and only valid render files', async () => {
      const video = await bed.recorded()
      await expect((await play(video.id)).assetUrl('poster.jpg')).rejects.toMatchObject({
        code: 'asset.not_found',
      })

      await new RenderVideo(bed.deps).execute({ videoId: video.id, version: 1 })
      bed.storage.putText('videos/vid_1/r1/720p/index.m3u8', '#EXTM3U\n')
      const playback = await play(video.id, 'owner_1')

      expect(playback.isOwner).toBe(true)
      expect(playback.source).toEqual({
        kind: 'render',
        render: { ...FAKE_RENDER_OUTPUT, version: 1, trim: null },
      })
      expect(await playback.assetUrl('video.mp4', { downloadFilename: 'Demo.mp4' })).toBe(
        'fake-get://videos/vid_1/r1/video.mp4?download=Demo.mp4',
      )
      expect(await playback.readAsset('720p/index.m3u8')).toBe('#EXTM3U\n')
      await expect(playback.readAsset('1080p/index.m3u8')).rejects.toMatchObject({
        code: 'asset.not_found',
      })
      await expect(playback.assetUrl('../../other/video.mp4')).rejects.toMatchObject({
        code: 'asset.not_found',
      })
    })

    it('hides workspace and private videos from those who cannot see them', async () => {
      const video = await bed.recorded()
      await bed.videos.update({ ...video, privacy: 'workspace' })
      await expect(play(video.id)).rejects.toMatchObject({ code: 'video.not_found' })
      await expect(play(video.id, 'viewer_1')).resolves.toBeDefined()

      await bed.videos.update({ ...video, privacy: 'private' })
      await expect(play(video.id, 'member_1')).rejects.toMatchObject({ code: 'video.not_found' })
      await expect(play(video.id, 'owner_1')).resolves.toBeDefined()
    })
  })

  describe('password-protected videos', () => {
    async function protectedVideo(password = 'open sesame') {
      const video = await bed.recorded()
      return new UpdateVideo(bed.deps).execute({
        userId: 'owner_1',
        videoId: video.id,
        privacy: 'password',
        password,
      })
    }

    it('requires the password, then accepts the token from unlocking', async () => {
      const video = await protectedVideo()
      await expect(play(video.id)).rejects.toMatchObject({ code: 'video.password_required' })

      const unlock = new UnlockVideo(bed.deps)
      await expect(unlock.execute({ videoId: video.id, password: 'nope' })).rejects.toMatchObject({
        code: 'video.password_incorrect',
      })
      const token = await unlock.execute({ videoId: video.id, password: 'open sesame' })
      await expect(play(video.id, null, token)).resolves.toBeDefined()
      await expect(play(video.id, null, 'forged')).rejects.toMatchObject({
        code: 'video.password_required',
      })
    })

    it('invalidates old tokens when the password changes', async () => {
      const video = await protectedVideo()
      const token = await new UnlockVideo(bed.deps).execute({
        videoId: video.id,
        password: 'open sesame',
      })
      await new UpdateVideo(bed.deps).execute({
        userId: 'owner_1',
        videoId: video.id,
        password: 'new secret',
      })
      await expect(play(video.id, null, token)).rejects.toMatchObject({
        code: 'video.password_required',
      })
    })

    it('does not unlock videos that have no password', async () => {
      const video = await bed.recorded()
      await expect(
        new UnlockVideo(bed.deps).execute({ videoId: video.id, password: 'x' }),
      ).rejects.toMatchObject({ code: 'video.not_found' })
    })
  })
})
