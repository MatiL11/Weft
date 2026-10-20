import { beforeEach, describe, expect, it } from 'vitest'
import { AddComment, AddReaction, DeleteComment, EditComment, GetDiscussion } from './collaboration'
import { createTestBed, NOW } from './test-bed'
import { UnlockVideo } from './playback'
import { UpdateVideo } from './video-management'

describe('collaboration', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  let videoId: string
  const comment = (
    viewerId: string | null,
    extra: Partial<Parameters<AddComment['execute']>[0]> = {},
  ) => new AddComment(bed.deps).execute({ viewerId, videoId, body: 'Great point', ...extra })

  beforeEach(async () => {
    bed = await createTestBed()
    videoId = (await bed.recorded()).id
  })

  it('adds timestamped comments and replies, and tells everyone watching', async () => {
    const top = await comment('member_1', { timestampMs: 2500 })
    expect(top).toMatchObject({
      authorId: 'member_1',
      author: { id: 'member_1', name: 'Beto' },
      parentId: null,
      timestampMs: 2500,
      body: 'Great point',
      createdAt: NOW,
    })
    const reply = await comment('owner_1', {
      parentId: top.id,
      timestampMs: 4000,
      body: ' Thanks! ',
    })
    expect(reply).toMatchObject({ parentId: top.id, timestampMs: null, body: 'Thanks!' })

    expect(bed.events.events.map((e) => e.type)).toEqual(['comment.created', 'comment.created'])
    const discussion = await new GetDiscussion(bed.deps).execute({ viewerId: null, videoId })
    expect(discussion.comments.map((c) => c.id)).toEqual([top.id, reply.id])
  })

  it('requires signing in, a visible video and valid threads', async () => {
    await expect(comment(null)).rejects.toMatchObject({ code: 'comment.sign_in_required' })
    await expect(comment('member_1', { body: ' ' })).rejects.toMatchObject({
      code: 'comment.body_invalid',
    })
    await expect(comment('member_1', { timestampMs: 60_000 })).rejects.toMatchObject({
      code: 'comment.timestamp_invalid',
    })
    await expect(comment('member_1', { parentId: 'nope' })).rejects.toMatchObject({
      code: 'comment.not_found',
    })

    const top = await comment('member_1')
    const reply = await comment('member_1', { parentId: top.id })
    await expect(comment('member_1', { parentId: reply.id })).rejects.toMatchObject({
      code: 'comment.reply_invalid',
    })

    const video = (await bed.videos.findById(videoId))!
    await bed.videos.update({ ...video, privacy: 'private' })
    await expect(comment('member_1')).rejects.toMatchObject({ code: 'video.not_found' })
  })

  it('needs the password on protected videos', async () => {
    await new UpdateVideo(bed.deps).execute({
      userId: 'owner_1',
      videoId,
      privacy: 'password',
      password: 'abcd1234',
    })
    await expect(comment('member_1')).rejects.toMatchObject({ code: 'video.password_required' })
    const accessToken = await new UnlockVideo(bed.deps).execute({ videoId, password: 'abcd1234' })
    await expect(comment('member_1', { accessToken })).resolves.toBeDefined()
  })

  it('keeps timestamps on the recording when the video is trimmed', async () => {
    await new UpdateVideo(bed.deps).execute({
      userId: 'owner_1',
      videoId,
      trim: { startMs: 1000, endMs: 5000 },
    })
    const trimmed = await comment('member_1', { timestampMs: 500 })
    expect(trimmed.timestampMs).toBe(1500)
  })

  it('lets authors edit, and authors or the owner delete', async () => {
    const own = await comment('member_1')
    const edited = await new EditComment(bed.deps).execute({
      viewerId: 'member_1',
      videoId,
      commentId: own.id,
      body: 'Better point',
    })
    expect(edited).toMatchObject({ body: 'Better point', editedAt: NOW })
    await expect(
      new EditComment(bed.deps).execute({
        viewerId: 'owner_1',
        videoId,
        commentId: own.id,
        body: 'x',
      }),
    ).rejects.toMatchObject({ code: 'comment.forbidden' })
    await expect(
      new DeleteComment(bed.deps).execute({ viewerId: 'viewer_1', videoId, commentId: own.id }),
    ).rejects.toMatchObject({ code: 'comment.forbidden' })

    // The video's owner moderates.
    await new DeleteComment(bed.deps).execute({ viewerId: 'owner_1', videoId, commentId: own.id })
    const [deleted] = (await new GetDiscussion(bed.deps).execute({ viewerId: null, videoId }))
      .comments
    expect(deleted).toMatchObject({ body: '', deletedAt: NOW })
    // Deleting twice is harmless; deleted comments can't be edited or replied to.
    await new DeleteComment(bed.deps).execute({ viewerId: 'member_1', videoId, commentId: own.id })
    await expect(
      new EditComment(bed.deps).execute({
        viewerId: 'member_1',
        videoId,
        commentId: own.id,
        body: 'x',
      }),
    ).rejects.toMatchObject({ code: 'comment.forbidden' })
    await expect(comment('member_1', { parentId: own.id })).rejects.toMatchObject({
      code: 'comment.reply_invalid',
    })
    expect(bed.events.events.map((e) => e.type)).toEqual([
      'comment.created',
      'comment.updated',
      'comment.deleted',
    ])
  })

  it('accepts reactions from anyone who can watch, including anonymous viewers', async () => {
    const reaction = await new AddReaction(bed.deps).execute({
      viewerId: null,
      videoId,
      emoji: '🔥',
      timestampMs: 3000,
    })
    expect(reaction).toMatchObject({ userId: null, emoji: '🔥', timestampMs: 3000 })
    await expect(
      new AddReaction(bed.deps).execute({ viewerId: null, videoId, emoji: '💩', timestampMs: 0 }),
    ).rejects.toMatchObject({ code: 'reaction.emoji_invalid' })
    expect(
      (await new GetDiscussion(bed.deps).execute({ viewerId: null, videoId })).reactions,
    ).toEqual([reaction])
    expect(bed.events.events.at(-1)).toEqual({ type: 'reaction.created', videoId, reaction })
  })
})
