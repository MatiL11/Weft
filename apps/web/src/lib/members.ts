import type { WorkspaceRole } from './workspaces'

export type InvitableRole = Exclude<WorkspaceRole, 'owner'>

export interface MemberView {
  userId: string
  name: string
  email: string
  role: WorkspaceRole
  joinedAt: string
}

export interface PendingInvitation {
  id: string
  email: string
  role: InvitableRole
  createdAt: string
  expiresAt: string
}

export interface Roster {
  workspace: { id: string; name: string; slug: string }
  /** The viewer's own role. */
  role: WorkspaceRole
  members: MemberView[]
  invitations: PendingInvitation[]
}

export interface InvitationPreview {
  workspace: { id: string; name: string }
  email: string
  role: InvitableRole
  inviterName: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  expiresAt: string
}

export type Loaded<T> = { kind: 'ok'; data: T } | { kind: 'not_found' } | { kind: 'error' }

/** Server-side GET of an API resource, as the current user. */
export async function fetchAs<T>(url: string, cookieHeader: string): Promise<Loaded<T>> {
  try {
    const res = await fetch(url, { headers: { cookie: cookieHeader }, cache: 'no-store' })
    if (res.status === 404 || res.status === 401) return { kind: 'not_found' }
    if (!res.ok) return { kind: 'error' }
    const body = (await res.json()) as { data: T | null }
    return body.data ? { kind: 'ok', data: body.data } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

/** The signed-in user's id, from the auth server's session endpoint (not enveloped). */
export async function fetchSessionUserId(
  apiBaseUrl: string,
  cookieHeader: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/get-session`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { user?: { id?: unknown } } | null
    return typeof body?.user?.id === 'string' ? body.user.id : null
  } catch {
    return null
  }
}
