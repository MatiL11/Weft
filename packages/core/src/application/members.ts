import { DomainError } from '../domain/errors'
import {
  canChangeRole,
  canInvite,
  canManageMembers,
  canRemove,
  INVITATION_TTL_MS,
  invitationStatus,
  isInvitableRole,
  normalizeEmail,
  type Invitation,
  type InvitationStatus,
  type Member,
} from '../domain/membership'
import type { Workspace, WorkspaceRole } from '../domain/workspace'
import type {
  Clock,
  IdGenerator,
  InvitationRepository,
  SecretTokens,
  UserDirectory,
  WorkspaceRepository,
} from '../ports'

export interface MembersDeps {
  workspaces: WorkspaceRepository
  invitations: InvitationRepository
  users: UserDirectory
  tokens: SecretTokens
  ids: IdGenerator
  clock: Clock
}

const forbidden = () =>
  new DomainError('workspace.forbidden', 'You are not allowed to do that in this workspace.')

/** The caller's role, failing as "not found" for outsiders so workspaces aren't revealed. */
async function membership(deps: MembersDeps, workspaceId: string, userId: string) {
  const [workspace, role] = await Promise.all([
    deps.workspaces.findById(workspaceId),
    deps.workspaces.roleOf(workspaceId, userId),
  ])
  if (!workspace || !role) throw new DomainError('workspace.not_found', 'Workspace not found.')
  return { workspace, role }
}

function requireInvitableRole(role: string) {
  if (!isInvitableRole(role)) throw new DomainError('workspace.role_invalid', 'Unknown role.')
  return role
}

export interface Roster {
  workspace: Workspace
  /** The caller's role. */
  role: WorkspaceRole
  members: Member[]
  /** Pending invitations, for those who manage members. */
  invitations: Invitation[]
}

export class ListMembers {
  constructor(private readonly deps: MembersDeps) {}

  async execute(input: { userId: string; workspaceId: string }): Promise<Roster> {
    const { workspace, role } = await membership(this.deps, input.workspaceId, input.userId)
    const now = this.deps.clock.now()
    const [members, invitations] = await Promise.all([
      this.deps.workspaces.listMembers(workspace.id),
      canManageMembers(role) ? this.deps.invitations.listOpen(workspace.id) : Promise.resolve([]),
    ])
    return {
      workspace,
      role,
      members,
      invitations: invitations.filter((i) => invitationStatus(i, now) === 'pending'),
    }
  }
}

export class InviteMember {
  constructor(private readonly deps: MembersDeps) {}

  /** Returns the invitation and its secret token, which goes into the invite link. */
  async execute(input: {
    userId: string
    workspaceId: string
    email: string
    role: string
  }): Promise<{ invitation: Invitation; token: string }> {
    const { workspace, role: actor } = await membership(this.deps, input.workspaceId, input.userId)
    const role = requireInvitableRole(input.role)
    if (!canInvite(actor, role)) throw forbidden()
    const email = normalizeEmail(input.email)

    const existing = await this.deps.users.findByEmail(email)
    if (existing && (await this.deps.workspaces.roleOf(workspace.id, existing.id))) {
      throw new DomainError('invitation.already_member', 'This person is already a member.')
    }

    const token = this.deps.tokens.create()
    const now = this.deps.clock.now()
    const invitation: Invitation = {
      id: this.deps.ids.next(),
      workspaceId: workspace.id,
      email,
      role,
      tokenHash: this.deps.tokens.hash(token),
      invitedBy: input.userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      acceptedAt: null,
      revokedAt: null,
    }
    await this.deps.invitations.create(invitation)
    return { invitation, token }
  }
}

export class RevokeInvitation {
  constructor(private readonly deps: MembersDeps) {}

  async execute(input: { userId: string; workspaceId: string; invitationId: string }) {
    const { role } = await membership(this.deps, input.workspaceId, input.userId)
    if (!canManageMembers(role)) throw forbidden()
    const invitation = await this.deps.invitations.findById(input.invitationId)
    if (!invitation || invitation.workspaceId !== input.workspaceId) {
      throw new DomainError('invitation.not_found', 'Invitation not found.')
    }
    if (invitation.acceptedAt || invitation.revokedAt) return
    await this.deps.invitations.update({ ...invitation, revokedAt: this.deps.clock.now() })
  }
}

export interface InvitationDetails {
  invitation: Invitation
  status: InvitationStatus
  workspace: Workspace
  inviterName: string
}

async function loadByToken(deps: MembersDeps, token: string) {
  const invitation = await deps.invitations.findByTokenHash(deps.tokens.hash(token))
  const workspace = invitation ? await deps.workspaces.findById(invitation.workspaceId) : null
  if (!invitation || !workspace) {
    throw new DomainError('invitation.not_found', 'This invitation does not exist.')
  }
  return { invitation, workspace }
}

/** What an invite link is for, shown before accepting it. */
export class GetInvitation {
  constructor(private readonly deps: MembersDeps) {}

  async execute(input: { token: string }): Promise<InvitationDetails> {
    const { invitation, workspace } = await loadByToken(this.deps, input.token)
    const inviter = await this.deps.users.findById(invitation.invitedBy)
    return {
      invitation,
      status: invitationStatus(invitation, this.deps.clock.now()),
      workspace,
      inviterName: inviter?.name ?? '',
    }
  }
}

export class AcceptInvitation {
  constructor(private readonly deps: MembersDeps) {}

  async execute(input: { userId: string; token: string }): Promise<Workspace> {
    const { invitation, workspace } = await loadByToken(this.deps, input.token)
    const now = this.deps.clock.now()
    const status = invitationStatus(invitation, now)
    if (status !== 'pending') {
      throw new DomainError(`invitation.${status}`, `This invitation is ${status}.`)
    }
    const user = await this.deps.users.findById(input.userId)
    if (!user || normalizeEmail(user.email) !== invitation.email) {
      throw new DomainError(
        'invitation.wrong_account',
        `This invitation is for ${invitation.email}. Sign in with that account to accept it.`,
      )
    }
    await this.deps.workspaces.addMember(workspace.id, user.id, invitation.role)
    await this.deps.invitations.update({ ...invitation, acceptedAt: now })
    return workspace
  }
}

export class ChangeMemberRole {
  constructor(private readonly deps: MembersDeps) {}

  async execute(input: {
    userId: string
    workspaceId: string
    memberId: string
    role: string
  }): Promise<void> {
    const { role: actor } = await membership(this.deps, input.workspaceId, input.userId)
    const role = requireInvitableRole(input.role)
    const target = await this.deps.workspaces.roleOf(input.workspaceId, input.memberId)
    if (!target) throw new DomainError('member.not_found', 'Member not found.')
    if (!canChangeRole(actor, target, role)) throw forbidden()
    await this.deps.workspaces.setRole(input.workspaceId, input.memberId, role)
  }
}

/** Removes someone from the workspace, or lets a member leave it (owners can't). */
export class RemoveMember {
  constructor(private readonly deps: MembersDeps) {}

  async execute(input: { userId: string; workspaceId: string; memberId: string }): Promise<void> {
    const { role: actor } = await membership(this.deps, input.workspaceId, input.userId)
    const target = await this.deps.workspaces.roleOf(input.workspaceId, input.memberId)
    if (!target) throw new DomainError('member.not_found', 'Member not found.')
    const leaving = input.memberId === input.userId && target !== 'owner'
    if (!leaving && !canRemove(actor, target)) throw forbidden()
    await this.deps.workspaces.removeMember(input.workspaceId, input.memberId)
  }
}
