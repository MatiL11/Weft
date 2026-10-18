import { beforeEach, describe, expect, it } from 'vitest'
import {
  AcceptInvitation,
  ChangeMemberRole,
  GetInvitation,
  InviteMember,
  ListMembers,
  RemoveMember,
  RevokeInvitation,
} from './members'
import { createTestBed, NOW } from './test-bed'

describe('workspace members', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  const invite = (email: string, role = 'member', userId = 'owner_1') =>
    new InviteMember(bed.deps).execute({ userId, workspaceId: 'ws_1', email, role })
  const roster = (userId = 'owner_1') =>
    new ListMembers(bed.deps).execute({ userId, workspaceId: 'ws_1' })

  beforeEach(async () => {
    bed = await createTestBed()
  })

  it('lists members with names, owners first, and pending invitations for managers', async () => {
    await invite('Dani@Example.com')
    const list = await roster()
    expect(list.role).toBe('owner')
    expect(list.members.map((m) => [m.name, m.role])).toEqual([
      ['Ana', 'owner'],
      ['Beto', 'member'],
      ['Caro', 'viewer'],
    ])
    expect(list.invitations.map((i) => i.email)).toEqual(['dani@example.com'])
    expect((await roster('member_1')).invitations).toEqual([])
    await expect(roster('outsider')).rejects.toMatchObject({ code: 'workspace.not_found' })
  })

  it('invites by link: the invited account joins with the offered role', async () => {
    const { invitation, token } = await invite('dani@example.com', 'viewer')
    expect(invitation).toMatchObject({
      email: 'dani@example.com',
      role: 'viewer',
      tokenHash: `hash:${token}`,
      expiresAt: new Date(NOW.getTime() + 7 * 24 * 3600 * 1000),
    })
    expect(await new GetInvitation(bed.deps).execute({ token })).toMatchObject({
      status: 'pending',
      workspace: { id: 'ws_1', name: 'Acme' },
      inviterName: 'Ana',
    })

    await expect(
      new AcceptInvitation(bed.deps).execute({ userId: 'member_1', token }),
    ).rejects.toMatchObject({ code: 'invitation.wrong_account' })
    const workspace = await new AcceptInvitation(bed.deps).execute({ userId: 'outsider', token })
    expect(workspace.id).toBe('ws_1')
    expect(await bed.workspaces.roleOf('ws_1', 'outsider')).toBe('viewer')
    await expect(
      new AcceptInvitation(bed.deps).execute({ userId: 'outsider', token }),
    ).rejects.toMatchObject({ code: 'invitation.accepted' })
    await expect(new GetInvitation(bed.deps).execute({ token: 'nope' })).rejects.toMatchObject({
      code: 'invitation.not_found',
    })
  })

  it('enforces who can invite whom', async () => {
    await expect(invite('x@y.co', 'member', 'member_1')).rejects.toMatchObject({
      code: 'workspace.forbidden',
    })
    await expect(invite('x@y.co', 'owner')).rejects.toMatchObject({
      code: 'workspace.role_invalid',
    })
    await expect(invite('not-an-email')).rejects.toMatchObject({ code: 'invitation.email_invalid' })
    await expect(invite('beto@example.com')).rejects.toMatchObject({
      code: 'invitation.already_member',
    })

    await bed.workspaces.setRole('ws_1', 'member_1', 'admin')
    await expect(invite('x@y.co', 'admin', 'member_1')).rejects.toMatchObject({
      code: 'workspace.forbidden',
    })
    await expect(invite('x@y.co', 'member', 'member_1')).resolves.toBeDefined()
  })

  it('revokes invitations', async () => {
    const { invitation, token } = await invite('dani@example.com')
    await expect(
      new RevokeInvitation(bed.deps).execute({
        userId: 'viewer_1',
        workspaceId: 'ws_1',
        invitationId: invitation.id,
      }),
    ).rejects.toMatchObject({ code: 'workspace.forbidden' })
    await new RevokeInvitation(bed.deps).execute({
      userId: 'owner_1',
      workspaceId: 'ws_1',
      invitationId: invitation.id,
    })
    await new RevokeInvitation(bed.deps).execute({
      userId: 'owner_1',
      workspaceId: 'ws_1',
      invitationId: invitation.id,
    })
    await expect(
      new AcceptInvitation(bed.deps).execute({ userId: 'outsider', token }),
    ).rejects.toMatchObject({ code: 'invitation.revoked' })
    await expect(
      new RevokeInvitation(bed.deps).execute({
        userId: 'owner_1',
        workspaceId: 'ws_1',
        invitationId: 'nope',
      }),
    ).rejects.toMatchObject({ code: 'invitation.not_found' })
    expect((await roster()).invitations).toEqual([])
  })

  it('expires invitations after a week', async () => {
    const { token } = await invite('dani@example.com')
    const later = {
      ...bed.deps,
      clock: { now: () => new Date(NOW.getTime() + 8 * 24 * 3600 * 1000) },
    }
    await expect(
      new AcceptInvitation(later).execute({ userId: 'outsider', token }),
    ).rejects.toMatchObject({
      code: 'invitation.expired',
    })
  })

  it('changes roles and removes members within the rules', async () => {
    const change = (userId: string, memberId: string, role: string) =>
      new ChangeMemberRole(bed.deps).execute({ userId, workspaceId: 'ws_1', memberId, role })
    const remove = (userId: string, memberId: string) =>
      new RemoveMember(bed.deps).execute({ userId, workspaceId: 'ws_1', memberId })

    await change('owner_1', 'member_1', 'admin')
    expect(await bed.workspaces.roleOf('ws_1', 'member_1')).toBe('admin')
    await expect(change('member_1', 'owner_1', 'viewer')).rejects.toMatchObject({
      code: 'workspace.forbidden',
    })
    await expect(change('owner_1', 'nobody', 'viewer')).rejects.toMatchObject({
      code: 'member.not_found',
    })
    await expect(change('owner_1', 'member_1', 'owner')).rejects.toMatchObject({
      code: 'workspace.role_invalid',
    })
    await change('member_1', 'viewer_1', 'member')

    await expect(remove('viewer_1', 'member_1')).rejects.toMatchObject({
      code: 'workspace.forbidden',
    })
    await expect(remove('owner_1', 'owner_1')).rejects.toMatchObject({
      code: 'workspace.forbidden',
    })
    await expect(remove('owner_1', 'nobody')).rejects.toMatchObject({ code: 'member.not_found' })
    await remove('member_1', 'viewer_1')
    // Anyone but the owner can leave.
    await remove('member_1', 'member_1')
    expect((await roster()).members.map((m) => m.userId)).toEqual(['owner_1'])
  })
})
