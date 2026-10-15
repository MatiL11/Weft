import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { runMigrations } from '@weft/infra-db'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from './config'
import { createContainer, personalWorkspaceName, type Container } from './container'

const PUBLIC_URL = 'http://localhost:3000'

describe('personalWorkspaceName', () => {
  it.each([
    ['Ana García', "Ana's workspace"],
    ['  Beto  ', "Beto's workspace"],
    ['   ', 'My workspace'],
  ])('%j → %j', (input, expected) => {
    expect(personalWorkspaceName(input)).toBe(expected)
  })
})

describe('container (integration: signup → personal workspace)', () => {
  let pg: StartedPostgreSqlContainer
  let container: Container

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:17-alpine').start()
    await runMigrations(pg.getConnectionUri())
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: pg.getConnectionUri(),
      BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-1234567890',
      PUBLIC_URL,
    })
    container = createContainer(config, pino({ level: 'silent' }))
  })

  afterAll(async () => {
    await container?.close()
    await pg?.stop()
  })

  it('creates a personal workspace when a user signs up', async () => {
    const signUp = await container.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: PUBLIC_URL },
      body: JSON.stringify({ name: 'Ana García', email: 'ana@example.com', password: 'supersecret123' }),
    })
    expect(signUp.status).toBe(200)

    const cookie = signUp.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    expect(cookie).toContain('session_token')

    const res = await container.app.request('/api/workspaces', { headers: { cookie } })
    const body = (await res.json()) as { data: { workspace: { name: string; slug: string }; role: string }[] }

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({
      workspace: { name: "Ana's workspace", slug: 'ana-s-workspace' },
      role: 'owner',
    })
  })

  it('rejects API requests without a session', async () => {
    const res = await container.app.request('/api/workspaces')
    expect(res.status).toBe(401)
  })
})
