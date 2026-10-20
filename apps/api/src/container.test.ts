import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { runMigrations } from '@weft/infra-db'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig, type Config } from './config'
import { createContainer, personalWorkspaceName, type Container } from './container'

const PUBLIC_URL = 'http://localhost:3000'

describe('personalWorkspaceName', () => {
  it.each([
    ['Ana García', 'en', "Ana's workspace"],
    ['  Beto  ', 'en', "Beto's workspace"],
    ['   ', 'en', 'My workspace'],
    ['Ana García', 'es', 'Espacio de Ana'],
    ['   ', 'es', 'Mi espacio'],
  ] as const)('%j (%s) → %j', (input, locale, expected) => {
    expect(personalWorkspaceName(input, locale)).toBe(expected)
  })
})

describe('container (integration: signup → personal workspace)', () => {
  let pg: StartedPostgreSqlContainer
  let container: Container
  let config: Config

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:17-alpine').start()
    await runMigrations(pg.getConnectionUri())
    config = loadConfig({
      NODE_ENV: 'test',
      OPEN_SIGNUP: 'true',
      DATABASE_URL: pg.getConnectionUri(),
      BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-1234567890',
      PUBLIC_URL,
      // Storage is not touched by the sign-up flow under test.
      S3_ENDPOINT: 'http://127.0.0.1:1',
      S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:1',
      S3_ACCESS_KEY_ID: 'unused',
      S3_SECRET_ACCESS_KEY: 'unused-storage-secret',
    })
    container = await createContainer(config, pino({ level: 'silent' }))
  })

  afterAll(async () => {
    await container?.close()
    await pg?.stop()
  })

  async function signUpAndListWorkspaces(email: string, headers: Record<string, string> = {}) {
    const signUp = await container.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: PUBLIC_URL, ...headers },
      body: JSON.stringify({ name: 'Ana García', email, password: 'supersecret123' }),
    })
    expect(signUp.status).toBe(200)

    const cookie = signUp.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    expect(cookie).toContain('session_token')

    const res = await container.app.request('/api/workspaces', { headers: { cookie } })
    expect(res.status).toBe(200)
    return (await res.json()) as {
      data: { workspace: { name: string; slug: string }; role: string }[]
    }
  }

  it('creates a personal workspace when a user signs up', async () => {
    const body = await signUpAndListWorkspaces('ana@example.com')

    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({
      workspace: { name: "Ana's workspace", slug: 'ana-s-workspace' },
      role: 'owner',
    })
  })

  it('names the personal workspace in the language of the request', async () => {
    const fromBrowser = await signUpAndListWorkspaces('ana.es@example.com', {
      'accept-language': 'es-AR,es;q=0.9',
    })
    const fromCookie = await signUpAndListWorkspaces('ana.cookie@example.com', {
      'accept-language': 'en',
      cookie: 'WEFT_LOCALE=es',
    })

    expect(fromBrowser.data[0]?.workspace.name).toBe('Espacio de Ana')
    expect(fromCookie.data[0]?.workspace.name).toBe('Espacio de Ana')
  })

  it('turns strangers away when sign-up is invite-only', async () => {
    const closed = await createContainer(
      { ...config, OPEN_SIGNUP: false },
      pino({ level: 'silent' }),
    )
    try {
      const res = await closed.app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: PUBLIC_URL },
        body: JSON.stringify({ name: 'Eve', email: 'eve@example.com', password: 'supersecret123' }),
      })
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ code: 'SIGN_UP_INVITE_ONLY' })
    } finally {
      await closed.close()
    }
  })

  it('rejects API requests without a session', async () => {
    const res = await container.app.request('/api/workspaces')
    expect(res.status).toBe(401)
  })
})
