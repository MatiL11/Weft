import type { Folder, FolderRepository } from '@weft/core'
import { asc, eq } from 'drizzle-orm'
import type { Database } from './client'
import { folders } from './schema'

export class DrizzleFolderRepository implements FolderRepository {
  constructor(private readonly db: Database) {}

  async create(folder: Folder): Promise<void> {
    await this.db.insert(folders).values(folder)
  }

  async update(folder: Folder): Promise<void> {
    await this.db.update(folders).set({ name: folder.name }).where(eq(folders.id, folder.id))
  }

  async delete(id: string): Promise<void> {
    // Its videos move to the top level (ON DELETE SET NULL).
    await this.db.delete(folders).where(eq(folders.id, id))
  }

  async findById(id: string): Promise<Folder | null> {
    const [row] = await this.db.select().from(folders).where(eq(folders.id, id)).limit(1)
    return row ?? null
  }

  async listForWorkspace(workspaceId: string): Promise<Folder[]> {
    return this.db
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, workspaceId))
      .orderBy(asc(folders.name))
  }
}
