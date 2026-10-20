import { beforeEach, describe, expect, it } from 'vitest'
import { FixedClock } from '../testing'
import {
  CreateFolder,
  DeleteFolder,
  ListFolders,
  ListVideos,
  MoveVideo,
  PurgeAbandonedRecordings,
  PurgeTrash,
  RenameFolder,
  RestoreVideo,
  TrashVideo,
} from './library'
import { GetPlayback } from './playback'
import { RenderVideo } from './rendering'
import { createTestBed, NOW } from './test-bed'
import { TranscribeVideo } from './transcription'
import { UpdateVideo } from './video-management'

describe('library', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  const list = (userId: string, extra = {}) =>
    new ListVideos(bed.deps).execute({ userId, workspaceId: 'ws_1', ...extra })
  const ids = async (userId: string, extra = {}) =>
    (await list(userId, extra)).map((i) => i.video.id)

  beforeEach(async () => {
    bed = await createTestBed()
  })

  it("lists the workspace's videos, without other people's private ones", async () => {
    const mine = await bed.recorded()
    const theirs = await bed.start('member_1')
    await bed.videos.update({ ...theirs, privacy: 'private' })

    expect(await ids('owner_1')).toEqual([mine.id])
    expect((await ids('member_1')).sort()).toEqual([mine.id, theirs.id].sort())
    await expect(list('outsider')).rejects.toMatchObject({ code: 'workspace.forbidden' })
  })

  it('organizes videos in folders', async () => {
    const video = await bed.recorded()
    const folder = await new CreateFolder(bed.deps).execute({
      userId: 'member_1',
      workspaceId: 'ws_1',
      name: ' Demos ',
    })
    expect(folder).toMatchObject({ name: 'Demos', createdBy: 'member_1', createdAt: NOW })
    await expect(
      new CreateFolder(bed.deps).execute({ userId: 'viewer_1', workspaceId: 'ws_1', name: 'x' }),
    ).rejects.toMatchObject({ code: 'workspace.forbidden' })

    await new MoveVideo(bed.deps).execute({
      userId: 'owner_1',
      videoId: video.id,
      folderId: folder.id,
    })
    expect(await ids('owner_1', { folderId: folder.id })).toEqual([video.id])
    expect(await ids('owner_1', { folderId: null })).toEqual([])
    expect(await ids('owner_1')).toEqual([video.id])
    await expect(
      new MoveVideo(bed.deps).execute({ userId: 'owner_1', videoId: video.id, folderId: 'nope' }),
    ).rejects.toMatchObject({ code: 'folder.not_found' })
    await expect(
      new MoveVideo(bed.deps).execute({ userId: 'member_1', videoId: video.id, folderId: null }),
    ).rejects.toMatchObject({ code: 'video.forbidden' })

    // Creators and admins rename and delete; deleting keeps the videos.
    await expect(
      new RenameFolder(bed.deps).execute({ userId: 'viewer_1', folderId: folder.id, name: 'x' }),
    ).rejects.toMatchObject({ code: 'folder.forbidden' })
    await expect(
      new RenameFolder(bed.deps).execute({ userId: 'outsider', folderId: folder.id, name: 'x' }),
    ).rejects.toMatchObject({ code: 'folder.not_found' })
    expect(
      (
        await new RenameFolder(bed.deps).execute({
          userId: 'owner_1',
          folderId: folder.id,
          name: 'Q4',
        })
      ).name,
    ).toBe('Q4')
    expect(
      (await new ListFolders(bed.deps).execute({ userId: 'viewer_1', workspaceId: 'ws_1' })).map(
        (f) => f.name,
      ),
    ).toEqual(['Q4'])
    await new DeleteFolder(bed.deps).execute({ userId: 'member_1', folderId: folder.id })
    await expect(
      new DeleteFolder(bed.deps).execute({ userId: 'member_1', folderId: folder.id }),
    ).rejects.toMatchObject({
      code: 'folder.not_found',
    })
    expect(await ids('owner_1', { folderId: null })).toEqual([video.id])
  })

  it('searches titles and transcripts, pointing at the line that matched', async () => {
    const video = await bed.recorded()
    await new RenderVideo(bed.deps).execute({ videoId: video.id, version: 1 })
    await new TranscribeVideo(bed.deps).execute({ videoId: video.id, version: 1 })

    const byTranscript = await list('owner_1', { search: 'DEMO' })
    expect(byTranscript.map((i) => i.match)).toEqual([
      { startMs: 2500, endMs: 5000, text: 'Esta es la demo.' },
    ])
    const byTitle = await list('owner_1', { search: 'demo' })
    expect(byTitle).toHaveLength(1)
    expect(await list('owner_1', { search: 'nothing like this' })).toEqual([])

    // Others can't learn what a password-protected video says.
    await new UpdateVideo(bed.deps).execute({
      userId: 'owner_1',
      videoId: video.id,
      privacy: 'password',
      password: 'abcd',
    })
    expect(await list('member_1', { search: 'Esta es la demo' })).toEqual([])
    expect(await list('owner_1', { search: 'Esta es la demo' })).toHaveLength(1)
  })

  it("filters others' private videos before the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const hidden = await bed.start('member_1')
      await bed.videos.update({ ...hidden, privacy: 'private' })
    }
    const mine = await bed.start('owner_1')
    expect(await ids('owner_1')).toEqual([mine.id])
  })

  it('moves videos to the trash, where only their owner sees them, and back', async () => {
    const video = await bed.recorded()
    await expect(
      new TrashVideo(bed.deps).execute({ userId: 'member_1', videoId: video.id }),
    ).rejects.toMatchObject({
      code: 'video.forbidden',
    })
    const trashed = await new TrashVideo(bed.deps).execute({ userId: 'owner_1', videoId: video.id })
    expect(trashed.trashedAt).toEqual(NOW)
    expect(await ids('owner_1')).toEqual([])
    expect(await ids('owner_1', { trashed: true })).toEqual([video.id])
    expect(await ids('member_1', { trashed: true })).toEqual([])
    await expect(
      new GetPlayback(bed.deps).execute({ viewerId: 'member_1', videoId: video.id }),
    ).rejects.toMatchObject({ code: 'video.not_found' })
    await expect(
      new GetPlayback(bed.deps).execute({ viewerId: 'owner_1', videoId: video.id }),
    ).resolves.toBeDefined()

    await new TrashVideo(bed.deps).execute({ userId: 'owner_1', videoId: video.id })
    const restored = await new RestoreVideo(bed.deps).execute({
      userId: 'owner_1',
      videoId: video.id,
    })
    expect(restored.trashedAt).toBeNull()
    expect(await ids('member_1')).toEqual([video.id])
  })

  it('deletes videos for good 30 days after they were trashed', async () => {
    const old = await bed.recorded()
    const recent = await bed.recorded()
    const day = 24 * 3600 * 1000
    await bed.videos.update({ ...old, trashedAt: new Date(NOW.getTime() - 31 * day) })
    await bed.videos.update({ ...recent, trashedAt: new Date(NOW.getTime() - 29 * day) })

    expect(await new PurgeTrash(bed.deps).execute()).toBe(1)
    expect(await new PurgeTrash(bed.deps).execute()).toBe(0)
    expect(await bed.videos.findById(old.id)).toBeNull()
    expect(bed.storage.keys().some((k) => k.includes(`/${old.id}/`))).toBe(false)
    expect(await bed.videos.findById(recent.id)).not.toBeNull()
  })

  it('deletes recordings that were never finished a day after they started', async () => {
    const abandoned = await bed.start()
    await bed.upload(abandoned.id, 'init', 0)
    const finished = await bed.recorded()
    const purge = (hoursLater: number) =>
      new PurgeAbandonedRecordings({
        ...bed.deps,
        clock: new FixedClock(new Date(NOW.getTime() + hoursLater * 3600 * 1000)),
      }).execute()

    expect(await purge(23)).toBe(0)
    expect(await purge(25)).toBe(1)
    expect(await bed.videos.findById(abandoned.id)).toBeNull()
    expect(bed.storage.keys().some((k) => k.includes(`/${abandoned.id}/`))).toBe(false)
    expect(await bed.videos.findById(finished.id)).not.toBeNull()
  })
})
