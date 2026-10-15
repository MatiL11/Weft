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
  | { kind: 'error'; message: string }

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
  if (!isEnvelope(body)) return { kind: 'error', message: 'Unexpected response from the server.' }
  if (status !== 200 || body.error) {
    return { kind: 'error', message: body.error?.message ?? 'Could not load workspaces.' }
  }
  if (!Array.isArray(body.data)) return { kind: 'error', message: 'Unexpected response from the server.' }
  return { kind: 'ok', memberships: body.data as WorkspaceMembership[] }
}

export async function fetchWorkspaces(apiBaseUrl: string, cookieHeader: string): Promise<WorkspacesResult> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/workspaces`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    const body: unknown = await res.json().catch(() => null)
    return parseWorkspacesResponse(res.status, body)
  } catch {
    return { kind: 'error', message: 'The API is unreachable. Is it running?' }
  }
}
