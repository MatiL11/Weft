// In-memory fakes of core ports, for fast use-case tests in any package.
import type { Workspace, WorkspaceMembership, WorkspaceRole } from '../domain/workspace'
import type { Clock, IdGenerator, WorkspaceRepository } from '../ports'

export class FixedClock implements Clock {
  constructor(private readonly date: Date) {}

  now(): Date {
    return this.date
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0

  constructor(private readonly prefix: string) {}

  next(): string {
    this.counter += 1
    return `${this.prefix}_${this.counter}`
  }
}

interface StoredMembership {
  workspaceId: string
  userId: string
  role: WorkspaceRole
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private workspaces: readonly Workspace[] = []
  private memberships: readonly StoredMembership[] = []

  /** @param reservedSlugs slugs treated as already taken (for collision tests). */
  constructor(private readonly reservedSlugs: ReadonlySet<string> = new Set()) {}

  async slugExists(slug: string): Promise<boolean> {
    return this.reservedSlugs.has(slug) || this.workspaces.some((w) => w.slug === slug)
  }

  async createWithMember(workspace: Workspace, userId: string, role: WorkspaceRole): Promise<void> {
    this.workspaces = [...this.workspaces, workspace]
    this.memberships = [...this.memberships, { workspaceId: workspace.id, userId, role }]
  }

  async listForUser(userId: string): Promise<WorkspaceMembership[]> {
    return this.memberships
      .filter((m) => m.userId === userId)
      .flatMap((m) => {
        const workspace = this.workspaces.find((w) => w.id === m.workspaceId)
        return workspace ? [{ workspace, role: m.role }] : []
      })
  }
}
