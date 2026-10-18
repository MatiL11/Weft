import { randomBytes } from 'node:crypto'
import type { GetVideoStats, RecordViewProgress, StartView } from '@weft/core'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { currentUser, requireUser, type AppEnv } from '../context'
import { fail, ok } from '../envelope'
import { invalid, parseJson } from '../validation'
import { accessCookieName } from './playback'

export interface AnalyticsRouteDeps {
  startView: StartView
  recordViewProgress: RecordViewProgress
  getVideoStats: GetVideoStats
  /** Limits new views per address and video, so counts can't be inflated cheaply. */
  viewLimiter: { tryHit(key: string): boolean }
  publicUrl: string
}

/** Identifies a browser across anonymous views, for unique-viewer counts. */
const VIEWER_COOKIE = 'weft_viewer'
const VIEWER_COOKIE_MAX_AGE = 365 * 24 * 60 * 60
const ProgressBody = z.object({
  buckets: z.number().int().nonnegative(),
  watchedMs: z.number().nonnegative().max(1e9),
})

export function analyticsRoutes(deps: AnalyticsRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  const secure = deps.publicUrl.startsWith('https://')

  routes.post('/:id/views', async (c) => {
    const videoId = c.req.param('id')
    if (!deps.viewLimiter.tryHit(`${c.get('clientIp')} ${videoId}`)) {
      return c.json(fail('view.too_many', 'Too many views from here.'), 429)
    }
    const viewerId = c.get('user')?.id ?? null
    let anonymousId = getCookie(c, VIEWER_COOKIE) ?? null
    if (!viewerId && !anonymousId) {
      anonymousId = randomBytes(16).toString('base64url')
      setCookie(c, VIEWER_COOKIE, anonymousId, {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        maxAge: VIEWER_COOKIE_MAX_AGE,
      })
    }
    const viewId = await deps.startView.execute({
      viewerId,
      videoId,
      accessToken: getCookie(c, accessCookieName(videoId)) ?? null,
      anonymousId,
    })
    return c.json(ok({ viewId }), 201)
  })

  // Also the target of navigator.sendBeacon when the page closes.
  routes.post('/:id/views/:viewId/progress', async (c) => {
    const body = await parseJson(c, ProgressBody)
    if (!body) return invalid(c)
    await deps.recordViewProgress.execute({
      videoId: c.req.param('id'),
      viewId: c.req.param('viewId'),
      ...body,
    })
    return c.json(ok({ recorded: true }))
  })

  routes.get('/:id/stats', requireUser, async (c) => {
    const stats = await deps.getVideoStats.execute({
      userId: currentUser(c.get('user')).id,
      videoId: c.req.param('id'),
    })
    return c.json(ok(stats))
  })

  return routes
}
