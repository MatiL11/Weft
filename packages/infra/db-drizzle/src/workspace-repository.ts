import type {
  Member,
  Workspace,
  WorkspaceMembership,
  WorkspaceRepository,
  WorkspaceRole,
} from '@weft/core'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from './client'
import { users, workspaceMembers, workspaces } from './schema'

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

  async roleOf(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    const rows = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      )
      .limit(1)
    return (rows[0]?.role as WorkspaceRole | undefined) ?? null
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

  async findById(id: string): Promise<Workspace | null> {
    const [row] = await this.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)
    return row ?? null
  }

  async listMembers(workspaceId: string): Promise<Member[]> {
    const rows = await this.db
      .select({
        userId: workspaceMembers.userId,
        name: users.name,
        email: users.email,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(sql`${workspaceMembers.role} = 'owner' desc`, asc(workspaceMembers.createdAt))
    return rows.map((row) => ({ ...row, role: row.role as WorkspaceRole }))
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
    await this.db
      .insert(workspaceMembers)
      .values({ workspaceId, userId, role })
      .onConflictDoNothing()
  }

  async setRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
    await this.db.update(workspaceMembers).set({ role }).where(this.member(workspaceId, userId))
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    await this.db.delete(workspaceMembers).where(this.member(workspaceId, userId))
  }

  private member(workspaceId: string, userId: string) {
    return and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  }
}
