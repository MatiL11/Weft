/** Workspace members, their roles, and invitations to join. */
import { DomainError } from './errors'
import type { WorkspaceRole } from './workspace'

/** Roles an invitation can grant; ownership is never handed out by invitation. */
export type InvitableRole = Exclude<WorkspaceRole, 'owner'>
export const INVITABLE_ROLES: readonly InvitableRole[] = ['admin', 'member', 'viewer']

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface Member {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly role: WorkspaceRole
  readonly joinedAt: Date
}

export interface Invitation {
  readonly id: string
  readonly workspaceId: string
  /** Only the account with this email can accept. */
  readonly email: string
  readonly role: InvitableRole
  /** The secret link token is never stored, only its hash. */
  readonly tokenHash: string
  readonly invitedBy: string
  readonly createdAt: Date
  readonly expiresAt: Date
  readonly acceptedAt: Date | null
  readonly revokedAt: Date | null
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export function invitationStatus(invitation: Invitation, now: Date): InvitationStatus {
  if (invitation.acceptedAt) return 'accepted'
  if (invitation.revokedAt) return 'revoked'
  return now.getTime() >= invitation.expiresAt.getTime() ? 'expired' : 'pending'
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX_LENGTH = 254

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase()
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL.test(email)) {
    throw new DomainError('invitation.email_invalid', 'Enter a valid email address.')
  }
  return email
}

export function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role)
}

const MANAGERS: ReadonlySet<WorkspaceRole> = new Set(['owner', 'admin'])

/** Owners and admins manage members; only owners hand out or take away the admin role. */
export function canManageMembers(actor: WorkspaceRole | null): boolean {
  return actor !== null && MANAGERS.has(actor)
}

export function canInvite(actor: WorkspaceRole | null, role: InvitableRole): boolean {
  return actor === 'owner' || (actor === 'admin' && role !== 'admin')
}

export function canChangeRole(
  actor: WorkspaceRole | null,
  target: WorkspaceRole,
  role: InvitableRole,
): boolean {
  if (target === 'owner') return false
  if (actor === 'owner') return true
  return actor === 'admin' && target !== 'admin' && role !== 'admin'
}

export function canRemove(actor: WorkspaceRole | null, target: WorkspaceRole): boolean {
  if (target === 'owner') return false
  return actor === 'owner' || (actor === 'admin' && target !== 'admin')
}
