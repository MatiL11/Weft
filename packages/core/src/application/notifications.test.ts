import { beforeEach, describe, expect, it } from 'vitest'
import { AddComment, DeleteComment } from './collaboration'
import { InviteMember } from './members'
import { DeliverNotification } from './notifications'
import { createTestBed } from './test-bed'
import { UpdateVideo } from './video-management'

describe('notifications', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  let videoId: string
  const comment = (viewerId: string, extra = {}) =>
    new AddComment(bed.deps).execute({ viewerId, videoId, body: 'Looks great', ...extra })
  const deliver = () => {
    const sent = bed.notifications.sent.splice(0)
    return Promise.all(sent.map((s) => new DeliverNotification(bed.deps).execute(s.notification)))
  }

  beforeEach(async () => {
    bed = await createTestBed()
    videoId = (await bed.recorded()).id
  })

  it('emails the owner about comments on their video, in their language', async () => {
    const created = await comment('member_1', { timestampMs: 3500 })
    expect(bed.notifications.sent).toEqual([
      {
        notification: { kind: 'comment', recipientId: 'owner_1', videoId, commentId: created.id },
        dedupeKey: `comment:owner_1:${videoId}`,
      },
    ])
    expect(await deliver()).toEqual(['sent'])
    const [email] = bed.mailer.outbox
    expect(email).toMatchObject({ to: 'ana@example.com', subject: 'comment:en' })
    expect(JSON.parse(email!.text)).toMatchObject({
      recipientName: 'Ana',
      authorName: 'Beto',
      videoTitle: 'Demo',
      commentText: 'Looks great',
      url: `https://weft.test/v/${videoId}?t=3`,
    })
  })

  it("doesn't email people about their own comments, and emails replies to the comment's author", async () => {
    const own = await comment('owner_1')
    expect(bed.notifications.sent).toEqual([])
    await comment('member_1', { parentId: own.id })
    expect(bed.notifications.sent[0]?.notification).toMatchObject({
      kind: 'reply',
      recipientId: 'owner_1',
    })

    const betos = await comment('member_1')
    bed.notifications.sent.splice(0)
    await comment('owner_1', { parentId: betos.id })
    expect(bed.notifications.sent[0]?.notification).toMatchObject({
      kind: 'reply',
      recipientId: 'member_1',
    })
    await deliver()
    expect(bed.mailer.outbox.at(-1)).toMatchObject({ to: 'beto@example.com', subject: 'reply:es' })
  })

  it('skips emails that no longer make sense', async () => {
    const created = await comment('member_1')
    await new DeleteComment(bed.deps).execute({
      viewerId: 'member_1',
      videoId,
      commentId: created.id,
    })
    expect(await deliver()).toEqual(['skipped'])

    await comment('owner_1', { parentId: (await comment('member_1')).id })
    bed.notifications.sent.splice(0, 1)
    // Beto loses access to the video before the email goes out.
    await new UpdateVideo(bed.deps).execute({ userId: 'owner_1', videoId, privacy: 'private' })
    expect(await deliver()).toEqual(['skipped'])
    expect(bed.mailer.outbox).toEqual([])
  })

  it('mails invitations with their link, only while they are valid', async () => {
    const { token } = await new InviteMember(bed.deps).execute({
      userId: 'owner_1',
      workspaceId: 'ws_1',
      email: 'new@example.com',
      role: 'viewer',
    })
    const [queued] = bed.notifications.sent
    expect(queued?.notification).toMatchObject({ kind: 'invitation', token })
    expect(await new DeliverNotification(bed.deps).execute(queued!.notification)).toBe('sent')
    expect(bed.mailer.outbox[0]).toMatchObject({ to: 'new@example.com', subject: 'invitation:en' })
    expect(JSON.parse(bed.mailer.outbox[0]!.text)).toMatchObject({
      inviterName: 'Ana',
      workspaceName: 'Acme',
      role: 'viewer',
      url: `https://weft.test/invite/${token}`,
    })

    const forged = {
      kind: 'invitation' as const,
      invitationId: (queued!.notification as { invitationId: string }).invitationId,
      token: 'forged',
    }
    expect(await new DeliverNotification(bed.deps).execute(forged)).toBe('skipped')
    expect(
      await new DeliverNotification(bed.deps).execute({
        kind: 'invitation',
        invitationId: 'nope',
        token,
      }),
    ).toBe('skipped')
  })

  it("doesn't fail comments or invitations when the email queue is down", async () => {
    bed.notifications.failing = true
    await expect(comment('member_1')).resolves.toBeDefined()
    await expect(
      new InviteMember(bed.deps).execute({
        userId: 'owner_1',
        workspaceId: 'ws_1',
        email: 'x@y.co',
        role: 'viewer',
      }),
    ).resolves.toBeDefined()
  })
})
