import type { View, ViewRepository } from '@weft/core'
import { count, desc, eq, inArray } from 'drizzle-orm'
import type { Database } from './client'
import { views } from './schema'

export class DrizzleViewRepository implements ViewRepository {
  constructor(private readonly db: Database) {}

  async create(view: View): Promise<void> {
    await this.db.insert(views).values(view)
  }

  async update(view: View): Promise<void> {
    const { buckets, watchedMs, lastSeenAt } = view
    await this.db.update(views).set({ buckets, watchedMs, lastSeenAt }).where(eq(views.id, view.id))
  }

  async findById(id: string): Promise<View | null> {
    const [row] = await this.db.select().from(views).where(eq(views.id, id)).limit(1)
    return row ?? null
  }

  async listForVideo(videoId: string, options: { limit: number }): Promise<View[]> {
    return this.db
      .select()
      .from(views)
      .where(eq(views.videoId, videoId))
      .orderBy(desc(views.startedAt))
      .limit(options.limit)
  }

  async countForVideos(videoIds: readonly string[]): Promise<Map<string, number>> {
    if (videoIds.length === 0) return new Map()
    const rows = await this.db
      .select({ videoId: views.videoId, total: count() })
      .from(views)
      .where(inArray(views.videoId, [...videoIds]))
      .groupBy(views.videoId)
    return new Map(rows.map((row) => [row.videoId, row.total]))
  }
}
