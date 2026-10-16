import { beforeEach, describe, expect, it } from 'vitest'
import { FAKE_RENDER_OUTPUT } from '../testing'
import { RenderVideo } from './rendering'
import { createTestBed } from './test-bed'
import { UpdateVideo } from './video-management'

describe('RenderVideo', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  const render = (videoId: string, version: number) =>
    new RenderVideo(bed.deps).execute({ videoId, version })

  beforeEach(async () => {
    bed = await createTestBed()
  })

  it('renders the segments in order and records the result', async () => {
    const video = await bed.recorded()
    await expect(render(video.id, 1)).resolves.toBe('rendered')

    expect(bed.renderer.calls).toEqual([
      {
        sourceKeys: [
          'videos/vid_1/init.mp4',
          'videos/vid_1/seg-000000.m4s',
          'videos/vid_1/seg-000001.m4s',
        ],
        trim: null,
        outputPrefix: 'videos/vid_1/r1/',
      },
    ])
    expect(await bed.videos.findById(video.id)).toMatchObject({
      renderState: 'ready',
      render: { ...FAKE_RENDER_OUTPUT, version: 1, trim: null },
    })
  })

  it('replaces the previous render and deletes its files', async () => {
    const video = await bed.recorded()
    await render(video.id, 1)
    const trim = { startMs: 1000, endMs: 5000 }
    await new UpdateVideo(bed.deps).execute({ userId: 'owner_1', videoId: video.id, trim })
    await render(video.id, 2)

    expect(bed.renderer.calls[1]?.trim).toEqual(trim)
    expect((await bed.videos.findById(video.id))?.render).toMatchObject({ version: 2, trim })
    expect(bed.storage.keys().filter((k) => k.includes('/r1/'))).toEqual([])
    expect(bed.storage.keys()).toContain('videos/vid_1/r2/video.mp4')
  })

  it('skips jobs for outdated versions and unknown videos', async () => {
    const video = await bed.recorded()
    await bed.videos.requestRender(video.id)
    await expect(render(video.id, 1)).resolves.toBe('stale')
    await expect(render('missing', 1)).resolves.toBe('stale')
    expect(bed.renderer.calls).toEqual([])
  })

  it('discards the output when the video changes during the render', async () => {
    const video = await bed.recorded()
    bed.renderer.during = async () => {
      await bed.videos.requestRender(video.id)
    }
    await expect(render(video.id, 1)).resolves.toBe('stale')
    expect(bed.storage.keys().filter((k) => k.includes('/r1/'))).toEqual([])
    expect((await bed.videos.findById(video.id))?.render).toBeNull()
  })

  it('marks the render failed, cleans up and rethrows so the job can retry', async () => {
    const video = await bed.recorded()
    bed.renderer.error = new Error('ffmpeg exploded')
    await expect(render(video.id, 1)).rejects.toThrow('ffmpeg exploded')
    expect((await bed.videos.findById(video.id))?.renderState).toBe('failed')
    expect(bed.storage.keys().filter((k) => k.includes('/r1/'))).toEqual([])
  })
})
