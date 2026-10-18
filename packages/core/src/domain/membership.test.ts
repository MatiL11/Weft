import { describe, expect, it } from 'vitest'
import {
  canChangeRole,
  canInvite,
  canManageMembers,
  canRemove,
  invitationStatus,
  isInvitableRole,
  normalizeEmail,
  type Invitation,
} from './membership'

const NOW = new Date('2026-10-17T10:00:00Z')
const invitation = (extra: Partial<Invitation> = {}): Invitation => ({
  id: 'i',
  workspaceId: 'w',
  email: 'a@b.co',
  role: 'member',
  tokenHash: 'h',
  invitedBy: 'u',
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 1000),
  acceptedAt: null,
  revokedAt: null,
  ...extra,
})

describe('membership rules', () => {
  it('normalizes emails', () => {
    expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com')
    for (const bad of ['', 'ana', 'ana@', 'a b@c.d', `${'x'.repeat(250)}@a.co`]) {
      expect(() => normalizeEmail(bad)).toThrowError(
        expect.objectContaining({ code: 'invitation.email_invalid' }),
      )
    }
  })

  it('tells invitation states apart', () => {
    expect(invitationStatus(invitation(), NOW)).toBe('pending')
    expect(invitationStatus(invitation(), new Date(NOW.getTime() + 1000))).toBe('expired')
    expect(invitationStatus(invitation({ revokedAt: NOW }), NOW)).toBe('revoked')
    expect(invitationStatus(invitation({ acceptedAt: NOW, revokedAt: NOW }), NOW)).toBe('accepted')
  })

  it('lets owners do anything but give away ownership, and admins manage non-admins', () => {
    expect(isInvitableRole('admin')).toBe(true)
    expect(isInvitableRole('owner')).toBe(false)
    expect([
      canManageMembers('owner'),
      canManageMembers('admin'),
      canManageMembers('member'),
      canManageMembers(null),
    ]).toEqual([true, true, false, false])

    expect(canInvite('owner', 'admin')).toBe(true)
    expect(canInvite('admin', 'admin')).toBe(false)
    expect(canInvite('admin', 'viewer')).toBe(true)
    expect(canInvite('member', 'viewer')).toBe(false)

    expect(canChangeRole('owner', 'admin', 'member')).toBe(true)
    expect(canChangeRole('owner', 'owner', 'member')).toBe(false)
    expect(canChangeRole('admin', 'member', 'viewer')).toBe(true)
    expect(canChangeRole('admin', 'member', 'admin')).toBe(false)
    expect(canChangeRole('admin', 'admin', 'member')).toBe(false)
    expect(canChangeRole('member', 'viewer', 'member')).toBe(false)

    expect(canRemove('owner', 'admin')).toBe(true)
    expect(canRemove('owner', 'owner')).toBe(false)
    expect(canRemove('admin', 'viewer')).toBe(true)
    expect(canRemove('admin', 'admin')).toBe(false)
    expect(canRemove('viewer', 'member')).toBe(false)
  })
})
