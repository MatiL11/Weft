export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  createdAt: string
}

export interface WorkspaceMembership {
  workspace: WorkspaceSummary
  role: WorkspaceRole
}

export type WorkspacesResult =
  | { kind: 'ok'; memberships: WorkspaceMembership[] }
  | { kind: 'unauthenticated' }
  /** `code` is a message key under `errors` (an API error code or a client-side condition). */
  | { kind: 'error'; code: string }

interface Envelope {
  data: unknown
  error: { code: string; message: string } | null
}

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === 'object' && value !== null && 'data' in value && 'error' in value
}

/** Interprets the API response for GET /api/workspaces without trusting its shape. */
export function parseWorkspacesResponse(status: number, body: unknown): WorkspacesResult {
  if (status === 401) return { kind: 'unauthenticated' }
  if (!isEnvelope(body)) return { kind: 'error', code: 'unexpected_response' }
  if (status !== 200 || body.error) {
    return { kind: 'error', code: body.error?.code ?? 'load_failed' }
  }
  if (!Array.isArray(body.data)) return { kind: 'error', code: 'unexpected_response' }
  return { kind: 'ok', memberships: body.data as WorkspaceMembership[] }
}

export async function fetchWorkspaces(
  apiBaseUrl: string,
  cookieHeader: string,
): Promise<WorkspacesResult> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/workspaces`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    const body: unknown = await res.json().catch(() => null)
    return parseWorkspacesResponse(res.status, body)
  } catch {
    return { kind: 'error', code: 'unreachable' }
  }
}
