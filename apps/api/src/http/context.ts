import type { MiddlewareHandler } from 'hono'
import { fail } from './envelope'

export interface SessionUser {
  id: string
}

/**
 * Hono context variables. `user` is null for anonymous requests (e.g. shared video links);
 * `clientIp` is the caller's address as reported by the trusted proxy (best effort).
 */
export type AppEnv = { Variables: { user: SessionUser | null; clientIp: string } }

/**
 * The client's address from X-Forwarded-For. Each proxy appends the address it received the
 * request from, so the entry `trustedHops` from the end was written by a proxy we trust;
 * entries before it may be forged by the client.
 */
export function clientIpFrom(forwardedFor: string | undefined, trustedHops: number): string {
  const hops = (forwardedFor ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  return hops[hops.length - trustedHops] ?? 'unknown'
}

/** Rejects anonymous requests. Routes behind it can rely on `c.get('user')` being set. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return c.json(fail('unauthorized', 'Authentication required.'), 401)
  await next()
}

export function currentUser(user: SessionUser | null): SessionUser {
  if (!user) throw new Error('requireUser middleware missing on this route')
  return user
}
