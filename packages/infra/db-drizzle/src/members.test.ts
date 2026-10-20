import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import {
  AcceptInvitation,
  ChangeMemberRole,
  InviteMember,
  ListMembers,
  RemoveMember,
  RevokeInvitation,
} from '@weft/core'
import {
  FakeNotificationQueue,
  FakeSecretTokens,
  FixedClock,
  SequentialIdGenerator,
} from '@weft/core/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectDatabase, runMigrations, type DatabaseHandle } from './client'
import { DrizzleInvitationRepository, DrizzleUserDirectory } from './invitation-repository'
import { users } from './schema'
import { DrizzleWorkspaceRepository } from './workspace-repository'

const NOW = new Date('2026-10-17T10:00:00.000Z')

describe('members and invitations (integration)', () => {
  let container: StartedPostgreSqlContainer
  let handle: DatabaseHandle

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    await runMigrations(container.getConnectionUri())
    handle = connectDatabase(container.getConnectionUri())
  })

  afterAll(async () => {
    await handle?.close()
    await container?.stop()
  })

  it('runs the invite → accept → manage flow on PostgreSQL', async () => {
    await handle.db.insert(users).values([
      { id: 'u1', name: 'Ana', email: 'ana@example.com' },
      { id: 'u2', name: 'Beto', email: 'Beto@Example.com' },
    ])
    const workspaces = new DrizzleWorkspaceRepository(handle.db)
    await workspaces.createWithMember(
      { id: 'ws', name: 'Acme', slug: 'acme', createdAt: NOW },
      'u1',
      'owner',
    )
    const deps = {
      workspaces,
      invitations: new DrizzleInvitationRepository(handle.db),
      users: new DrizzleUserDirectory(handle.db),
      tokens: new FakeSecretTokens(),
      notifications: new FakeNotificationQueue(),
      ids: new SequentialIdGenerator('inv'),
      clock: new FixedClock(NOW),
    }

    const revoked = await new InviteMember(deps).execute({
      userId: 'u1',
      workspaceId: 'ws',
      email: 'x@y.co',
      role: 'viewer',
    })
    await new RevokeInvitation(deps).execute({
      userId: 'u1',
      workspaceId: 'ws',
      invitationId: revoked.invitation.id,
    })
    const { token } = await new InviteMember(deps).execute({
      userId: 'u1',
      workspaceId: 'ws',
      email: 'beto@example.com',
      role: 'member',
    })
    expect(
      (await new ListMembers(deps).execute({ userId: 'u1', workspaceId: 'ws' })).invitations.map(
        (i) => i.email,
      ),
    ).toEqual(['beto@example.com'])
    expect((await deps.invitations.listOpenForEmail('beto@example.com')).length).toBe(1)
    expect(await deps.invitations.listOpenForEmail('x@y.co')).toEqual([])
    expect(await deps.users.hasAny()).toBe(true)

    // Email matching ignores case.
    await new AcceptInvitation(deps).execute({ userId: 'u2', token })
    // Adding an existing member again is harmless.
    await workspaces.addMember('ws', 'u2', 'viewer')
    const roster = await new ListMembers(deps).execute({ userId: 'u2', workspaceId: 'ws' })
    expect(roster.members.map((m) => [m.name, m.email, m.role])).toEqual([
      ['Ana', 'ana@example.com', 'owner'],
      ['Beto', 'Beto@Example.com', 'member'],
    ])
    expect(roster.invitations).toEqual([])
    expect(await workspaces.findById('ws')).toMatchObject({ name: 'Acme' })
    expect(await workspaces.findById('nope')).toBeNull()
    expect(await deps.users.findByEmail('nobody@example.com')).toBeNull()
    expect((await deps.users.findById('u2'))?.locale).toBe('en')
    await deps.users.setLocale('u2', 'es')
    expect((await deps.users.findByIds(['u1', 'u2', 'nope'])).map((u) => u.name).sort()).toEqual([
      'Ana',
      'Beto',
    ])
    expect(await deps.users.findByIds([])).toEqual([])
    expect((await deps.users.findById('u2'))?.locale).toBe('es')

    await new ChangeMemberRole(deps).execute({
      userId: 'u1',
      workspaceId: 'ws',
      memberId: 'u2',
      role: 'admin',
    })
    expect(await workspaces.roleOf('ws', 'u2')).toBe('admin')
    await new RemoveMember(deps).execute({ userId: 'u1', workspaceId: 'ws', memberId: 'u2' })
    expect(await workspaces.roleOf('ws', 'u2')).toBeNull()
  })
})
