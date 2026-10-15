import type { Workspace, WorkspaceMembership, WorkspaceRole } from '../domain/workspace'

export interface Clock {
  now(): Date
}

export interface IdGenerator {
  next(): string
}

export interface WorkspaceRepository {
  slugExists(slug: string): Promise<boolean>
  /** Persists the workspace and the owner's membership atomically. */
  createWithMember(workspace: Workspace, userId: string, role: WorkspaceRole): Promise<void>
  listForUser(userId: string): Promise<WorkspaceMembership[]>
}
