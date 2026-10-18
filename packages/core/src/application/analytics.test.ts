import { beforeEach, describe, expect, it } from 'vitest'
import { GetVideoStats, RecordViewProgress, StartView } from './analytics'
import { ListVideos } from './library'
import { DeliverNotification } from './notifications'
import { createTestBed } from './test-bed'
import { UpdateVideo } from './video-management'

describe('analytics', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  let videoId: string
  const start = (viewerId: string | null, anonymousId: string | null = null) =>
    new StartView(bed.deps).execute({ viewerId, videoId, anonymousId })
  const progress = (viewId: string, buckets: number, watchedMs = 1000) =>
    new RecordViewProgress(bed.deps).execute({ videoId, viewId, buckets, watchedMs })
  const stats = () => new GetVideoStats(bed.deps).execute({ userId: 'owner_1', videoId })

  beforeEach(async () => {
    bed = await createTestBed()
    videoId = (await bed.recorded()).id
  })

  it("counts views (not the owner's) and merges the parts watched", async () => {
    expect(await start('owner_1')).toBeNull()
    const beto = (await start('member_1'))!
    await progress(beto, 0b11, 2000)
    await progress(beto, 0b1100, 1500)
    const anon = (await start(null, 'cookie-1'))!
    await progress(anon, (1 << 20) - 1, 6000)

    const result = await stats()
    expect(result).toMatchObject({
      views: 2,
      uniqueViewers: 2,
      completionRate: 0.5,
      anonymousViews: 1,
      viewers: [{ viewerId: 'member_1', name: 'Beto', views: 1, watched: 0.2 }],
    })
    expect(result.retention.slice(0, 5)).toEqual([1, 1, 1, 1, 0.5])
    expect((await bed.views.findById(beto))?.watchedMs).toBe(2000)
  })

  it('keeps retention to views made with the current trim', async () => {
    const before = (await start(null, 'a'))!
    await progress(before, 1)
    await new UpdateVideo(bed.deps).execute({
      userId: 'owner_1',
      videoId,
      trim: { startMs: 1000, endMs: 5000 },
    })
    const after = (await start(null, 'b'))!
    await progress(after, 0b10)
    const result = await stats()
    expect(result.views).toBe(2)
    expect(result.retention.slice(0, 2)).toEqual([0, 1])
  })

  it('emails the owner when someone signed in watches, and respects privacy', async () => {
    await start('member_1')
    const [queued] = bed.notifications.sent
    expect(queued).toEqual({
      notification: { kind: 'view', recipientId: 'owner_1', videoId, viewerId: 'member_1' },
      dedupeKey: `view:owner_1:${videoId}:member_1`,
    })
    expect(await new DeliverNotification(bed.deps).execute(queued!.notification)).toBe('sent')
    expect(JSON.parse(bed.mailer.outbox[0]!.text)).toMatchObject({
      kind: 'view',
      viewerName: 'Beto',
      videoTitle: 'Demo',
      url: `https://weft.test/v/${videoId}`,
    })
    await start(null, 'anon')
    expect(bed.notifications.sent).toHaveLength(1)

    await new UpdateVideo(bed.deps).execute({ userId: 'owner_1', videoId, privacy: 'private' })
    await expect(start('member_1')).rejects.toMatchObject({ code: 'video.not_found' })
    await expect(
      new GetVideoStats(bed.deps).execute({ userId: 'member_1', videoId }),
    ).rejects.toMatchObject({
      code: 'video.forbidden',
    })
  })

  it('rejects progress for unknown views or another video, and survives a mail outage', async () => {
    await expect(progress('nope', 1)).rejects.toMatchObject({ code: 'view.not_found' })
    const other = await bed.recorded()
    const view = (await new StartView(bed.deps).execute({
      viewerId: null,
      videoId: other.id,
      anonymousId: null,
    }))!
    await expect(progress(view, 1)).rejects.toMatchObject({ code: 'view.not_found' })
    bed.notifications.failing = true
    await expect(start('member_1')).resolves.toBeTruthy()
  })

  it("shows view counts on the owner's library cards", async () => {
    await start(null, 'x')
    const [mine] = await new ListVideos(bed.deps).execute({
      userId: 'owner_1',
      workspaceId: 'ws_1',
    })
    expect(mine?.viewCount).toBe(1)
    const [theirs] = await new ListVideos(bed.deps).execute({
      userId: 'member_1',
      workspaceId: 'ws_1',
    })
    expect(theirs?.viewCount).toBeNull()
  })
})
