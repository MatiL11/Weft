import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, MiddlewareHandler } from 'hono'
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

/**
 * The API overwrites this header on requests to the auth handler with the client address it
 * resolved, so Better Auth's rate limits count per person instead of per proxy.
 */
export const CLIENT_IP_HEADER = 'x-weft-client-ip'

/**
 * The caller's address: from X-Forwarded-For behind `trustedHops` proxies, or from the socket
 * when the API is reached directly.
 */
export function resolveClientIp(c: Context, trustedHops: number): string {
  if (trustedHops > 0) return clientIpFrom(c.req.header('x-forwarded-for'), trustedHops)
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    // Not served by the Node adapter (e.g. in-process test requests).
    return 'unknown'
  }
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
