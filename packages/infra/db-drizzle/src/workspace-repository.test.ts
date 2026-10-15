import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { CreateWorkspace, type Workspace } from '@weft/core'
import { FixedClock, SequentialIdGenerator } from '@weft/core/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { connectDatabase, runMigrations, type DatabaseHandle } from './client'
import { users, workspaceMembers, workspaces } from './schema'
import { DrizzleWorkspaceRepository } from './workspace-repository'

const NOW = new Date('2026-10-15T12:00:00.000Z')

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return { id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW, ...overrides }
}

describe('DrizzleWorkspaceRepository (integration)', () => {
  let container: StartedPostgreSqlContainer
  let handle: DatabaseHandle
  let repo: DrizzleWorkspaceRepository

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    await runMigrations(container.getConnectionUri())
    handle = connectDatabase(container.getConnectionUri())
    repo = new DrizzleWorkspaceRepository(handle.db)
  })

  afterAll(async () => {
    await handle?.close()
    await container?.stop()
  })

  beforeEach(async () => {
    await handle.db.delete(workspaceMembers)
    await handle.db.delete(workspaces)
    await handle.db.delete(users)
    await handle.db.insert(users).values([
      { id: 'user_1', name: 'Ana', email: 'ana@example.com' },
      { id: 'user_2', name: 'Beto', email: 'beto@example.com' },
    ])
  })

  it('persists a workspace with its owner membership', async () => {
    await repo.createWithMember(workspace(), 'user_1', 'owner')

    expect(await repo.slugExists('acme')).toBe(true)
    expect(await repo.slugExists('other')).toBe(false)
    expect(await repo.listForUser('user_1')).toEqual([{ workspace: workspace(), role: 'owner' }])
    expect(await repo.listForUser('user_2')).toEqual([])
  })

  it('rolls back the workspace when the membership insert fails', async () => {
    await expect(repo.createWithMember(workspace(), 'missing_user', 'owner')).rejects.toThrow()

    expect(await repo.slugExists('acme')).toBe(false)
  })

  it('enforces unique slugs at the database level', async () => {
    await repo.createWithMember(workspace(), 'user_1', 'owner')

    await expect(
      repo.createWithMember(workspace({ id: 'ws_2' }), 'user_2', 'owner'),
    ).rejects.toThrow()
  })

  it('lists workspaces oldest first', async () => {
    const later = new Date(NOW.getTime() + 1000)
    await repo.createWithMember(workspace({ id: 'ws_b', slug: 'b', createdAt: later }), 'user_1', 'member')
    await repo.createWithMember(workspace({ id: 'ws_a', slug: 'a' }), 'user_1', 'owner')

    const slugs = (await repo.listForUser('user_1')).map((m) => m.workspace.slug)
    expect(slugs).toEqual(['a', 'b'])
  })

  it('works end-to-end with the CreateWorkspace use case', async () => {
    const useCase = new CreateWorkspace({
      workspaces: repo,
      ids: new SequentialIdGenerator('ws'),
      clock: new FixedClock(NOW),
    })

    await useCase.execute({ ownerId: 'user_1', name: 'Acme' })
    const second = await useCase.execute({ ownerId: 'user_2', name: 'Acme' })

    expect(second.slug).toBe('acme-2')
  })
})
