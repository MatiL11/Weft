import type { WorkspaceMembership, WorkspaceRepository, WorkspaceRole } from '@weft/core'
import type { Workspace } from '@weft/core'
import { asc, eq } from 'drizzle-orm'
import type { Database } from './client'
import { workspaceMembers, workspaces } from './schema'

export class DrizzleWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: Database) {}

  async slugExists(slug: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1)
    return rows.length > 0
  }

  async createWithMember(workspace: Workspace, userId: string, role: WorkspaceRole): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(workspaces).values(workspace)
      await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role })
    })
  }

  async listForUser(userId: string): Promise<WorkspaceMembership[]> {
    const rows = await this.db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaces.createdAt))

    return rows.map((row) => ({ workspace: row.workspace, role: row.role as WorkspaceRole }))
  }
}
