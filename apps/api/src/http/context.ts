import type { MiddlewareHandler } from 'hono'
import { fail } from './envelope'

export interface SessionUser {
  id: string
}

/** Hono context variables. `user` is null for anonymous requests (e.g. shared video links). */
export type AppEnv = { Variables: { user: SessionUser | null } }

/** Rejects anonymous requests. Routes behind it can rely on `c.get('user')` being set. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return c.json(fail('unauthorized', 'Authentication required.'), 401)
  await next()
}

export function currentUser(user: SessionUser | null): SessionUser {
  if (!user) throw new Error('requireUser middleware missing on this route')
  return user
}
