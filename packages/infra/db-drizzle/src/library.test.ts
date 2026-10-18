import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { createVideo } from '@weft/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectDatabase, runMigrations, type DatabaseHandle } from './client'
import { DrizzleFolderRepository } from './folder-repository'
import { users } from './schema'
import { DrizzleTranscriptRepository } from './transcript-repository'
import { DrizzleVideoRepository } from './video-repository'
import { DrizzleWorkspaceRepository } from './workspace-repository'

const NOW = new Date('2026-10-17T10:00:00.000Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

describe('library queries (integration)', () => {
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

  it('filters by folder and trash, searches titles and transcripts, and finds expired trash', async () => {
    await handle.db.insert(users).values({ id: 'u1', name: 'Ana', email: 'ana@example.com' })
    await new DrizzleWorkspaceRepository(handle.db).createWithMember(
      { id: 'ws', name: 'Acme', slug: 'acme', createdAt: NOW },
      'u1',
      'owner',
    )
    const repo = new DrizzleVideoRepository(handle.db)
    const folders = new DrizzleFolderRepository(handle.db)
    const transcripts = new DrizzleTranscriptRepository(handle.db)
    const video = (id: string, title: string, minutes: number) =>
      createVideo({ id, workspaceId: 'ws', ownerId: 'u1', title, now: at(minutes) })

    await folders.create({
      id: 'f1',
      workspaceId: 'ws',
      name: 'Zeta',
      createdBy: 'u1',
      createdAt: NOW,
    })
    await folders.create({
      id: 'f2',
      workspaceId: 'ws',
      name: 'Alfa',
      createdBy: 'u1',
      createdAt: NOW,
    })
    for (const v of [
      video('a', 'Planificación Q4', 1),
      video('b', 'Daily 50% off', 2),
      video('c', 'Bug report', 3),
    ]) {
      await repo.create(v)
    }
    await repo.update({ ...video('a', 'Planificación Q4', 1), folderId: 'f1' })
    await repo.update({ ...video('c', 'Bug report', 3), trashedAt: at(4) })
    await transcripts.save({
      videoId: 'b',
      renderVersion: 1,
      language: 'es',
      segments: [{ startMs: 0, endMs: 1000, text: 'Hablemos de la migración.' }],
      createdAt: NOW,
    })

    const list = async (filter: Partial<Parameters<typeof repo.listForWorkspace>[1]>) =>
      (await repo.listForWorkspace('ws', { limit: 10, trashed: false, ...filter })).map((v) => v.id)

    expect(await list({})).toEqual(['b', 'a'])
    expect(await list({ folderId: 'f1' })).toEqual(['a'])
    expect(await list({ folderId: null })).toEqual(['b'])
    expect(await list({ trashed: true })).toEqual(['c'])
    expect(await list({ search: 'PLANIFICACION' })).toEqual(['a'])
    expect(await list({ search: 'migracion' })).toEqual(['b'])
    // Wildcards in the query are literal.
    expect(await list({ search: '50%' })).toEqual(['b'])
    expect(await list({ search: '%' })).toEqual(['b'])
    expect(await list({ search: '_' })).toEqual([])

    expect((await transcripts.find('b'))?.segments).toHaveLength(1)
    expect((await folders.listForWorkspace('ws')).map((f) => f.name)).toEqual(['Alfa', 'Zeta'])
    await folders.update({
      id: 'f1',
      workspaceId: 'ws',
      name: 'Omega',
      createdBy: 'u1',
      createdAt: NOW,
    })
    expect((await folders.findById('f1'))?.name).toBe('Omega')
    await folders.delete('f1')
    expect(await folders.findById('f1')).toBeNull()
    expect((await repo.findById('a'))?.folderId).toBeNull()

    expect((await repo.listTrashedBefore(at(5), { limit: 10 })).map((v) => v.id)).toEqual(['c'])
    expect(await repo.listTrashedBefore(at(3), { limit: 10 })).toEqual([])
  })
})
