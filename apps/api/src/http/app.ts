import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import type { Logger } from 'pino'
import { clientIpFrom, type AppEnv, type SessionUser } from './context'
import { fail, ok, toErrorResponse } from './envelope'
import { discussionRoutes, type DiscussionRouteDeps } from './routes/discussion'
import { oembedRoutes } from './routes/oembed'
import { playbackRoutes, type PlaybackRouteDeps } from './routes/playback'
import { videoRoutes, type VideoRouteDeps } from './routes/videos'
import {
  folderRoutes,
  invitationRoutes,
  workspaceRoutes,
  type WorkspaceRouteDeps,
} from './routes/workspaces'

export type { SessionUser } from './context'

const JSON_BODY_LIMIT_BYTES = 64 * 1024

export interface AppDeps
  extends WorkspaceRouteDeps, VideoRouteDeps, PlaybackRouteDeps, DiscussionRouteDeps {
  /** Better Auth request handler mounted under /api/auth. */
  authHandler: (request: Request) => Promise<Response>
  getSessionUser: (headers: Headers) => Promise<SessionUser | null>
  /** Proxies in front of the API that append to X-Forwarded-For (the web app is one). */
  trustedProxyHops?: number
  logger: Pick<Logger, 'error'>
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

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

  const api = new Hono<AppEnv>()
  api.use(bodyLimit({ maxSize: JSON_BODY_LIMIT_BYTES }))
  // Resolve the session once; routes decide whether anonymous access is allowed.
  api.use(async (c, next) => {
    c.set('clientIp', clientIpFrom(c.req.header('x-forwarded-for'), deps.trustedProxyHops ?? 1))
    c.set('user', await deps.getSessionUser(c.req.raw.headers))
    await next()
  })
  api.route('/workspaces', workspaceRoutes(deps))
  api.route('/invitations', invitationRoutes(deps))
  api.route('/folders', folderRoutes(deps))
  api.route('/videos', videoRoutes(deps))
  api.route('/videos', playbackRoutes(deps))
  api.route('/videos', discussionRoutes(deps))
  api.route('/oembed', oembedRoutes(deps))

  app.route('/api', api)
  return app
}
