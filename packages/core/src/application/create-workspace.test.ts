import { beforeEach, describe, expect, it } from 'vitest'
import { FixedClock, InMemoryWorkspaceRepository, SequentialIdGenerator } from '../testing'
import { CreateWorkspace } from './create-workspace'

const NOW = new Date('2026-10-15T12:00:00Z')

describe('CreateWorkspace', () => {
  let repo: InMemoryWorkspaceRepository
  let useCase: CreateWorkspace

  beforeEach(() => {
    repo = new InMemoryWorkspaceRepository()
    useCase = new CreateWorkspace({
      workspaces: repo,
      ids: new SequentialIdGenerator('ws'),
      clock: new FixedClock(NOW),
    })
  })

  it('creates the workspace and makes the creator its owner', async () => {
    const ws = await useCase.execute({ ownerId: 'user_1', name: 'Acme Team' })

    expect(ws).toEqual({ id: 'ws_1', name: 'Acme Team', slug: 'acme-team', createdAt: NOW })
    expect(await repo.listForUser('user_1')).toEqual([{ workspace: ws, role: 'owner' }])
  })

  it('suffixes the slug when it is already taken', async () => {
    await useCase.execute({ ownerId: 'user_1', name: 'Acme' })
    const second = await useCase.execute({ ownerId: 'user_2', name: 'Acme' })
    const third = await useCase.execute({ ownerId: 'user_3', name: 'acme' })

    expect(second.slug).toBe('acme-2')
    expect(third.slug).toBe('acme-3')
  })

  it('falls back to an id-based slug after too many collisions', async () => {
    const taken = new Set(['acme', ...Array.from({ length: 49 }, (_, i) => `acme-${i + 2}`)])
    repo = new InMemoryWorkspaceRepository(taken)
    useCase = new CreateWorkspace({
      workspaces: repo,
      ids: new SequentialIdGenerator('ws'),
      clock: new FixedClock(NOW),
    })

    const ws = await useCase.execute({ ownerId: 'user_1', name: 'Acme' })

    expect(ws.slug).toBe('acme-ws-1')
  })

  it('rejects an invalid name without persisting anything', async () => {
    await expect(useCase.execute({ ownerId: 'user_1', name: '' })).rejects.toMatchObject({
      code: 'workspace.name_invalid',
    })
    expect(await repo.listForUser('user_1')).toEqual([])
  })
})
