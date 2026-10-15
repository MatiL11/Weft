import type { CreateWorkspace, WorkspaceRepository } from '@weft/core'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import type { Logger } from 'pino'
import { z } from 'zod'
import { fail, ok, toErrorResponse } from './envelope'

const JSON_BODY_LIMIT_BYTES = 64 * 1024

export interface SessionUser {
  id: string
}

export interface AppDeps {
  /** Better Auth request handler mounted under /api/auth. */
  authHandler: (request: Request) => Promise<Response>
  getSessionUser: (headers: Headers) => Promise<SessionUser | null>
  workspaces: WorkspaceRepository
  createWorkspace: CreateWorkspace
  logger: Pick<Logger, 'error'>
}

const CreateWorkspaceBody = z.object({ name: z.string() })

type Env = { Variables: { user: SessionUser } }

export function createApp(deps: AppDeps): Hono<Env> {
  const app = new Hono<Env>()

  app.use(secureHeaders())

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json(fail('http_error', error.message || 'Request rejected.'), error.status)
    }
    const { status, body } = toErrorResponse(error)
    if (status === 500) deps.logger.error({ err: error, path: c.req.path }, 'unhandled error')
    return c.json(body, status)
  })

  app.get('/health', (c) => c.json(ok({ status: 'ok' })))

  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.authHandler(c.req.raw))

  const api = new Hono<Env>()
  api.use(bodyLimit({ maxSize: JSON_BODY_LIMIT_BYTES }))
  api.use(async (c, next) => {
    const user = await deps.getSessionUser(c.req.raw.headers)
    if (!user) return c.json(fail('unauthorized', 'Authentication required.'), 401)
    c.set('user', user)
    await next()
  })

  api.get('/workspaces', async (c) => {
    const memberships = await deps.workspaces.listForUser(c.get('user').id)
    return c.json(ok(memberships))
  })

  api.post('/workspaces', async (c) => {
    const parsed = CreateWorkspaceBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json(fail('validation_error', 'Body must be { name: string }.'), 400)

    const workspace = await deps.createWorkspace.execute({
      ownerId: c.get('user').id,
      name: parsed.data.name,
    })
    return c.json(ok(workspace), 201)
  })

  app.route('/api', api)
  return app
}
