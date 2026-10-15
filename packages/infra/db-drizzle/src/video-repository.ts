import type {
  SegmentKind,
  Video,
  VideoPrivacy,
  VideoRepository,
  VideoSegment,
  VideoStatus,
} from '@weft/core'
import { and, eq } from 'drizzle-orm'
import type { Database } from './client'
import { videoSegments, videos } from './schema'

type VideoRow = typeof videos.$inferSelect
type SegmentRow = typeof videoSegments.$inferSelect

const toVideo = (row: VideoRow): Video => ({
  ...row,
  status: row.status as VideoStatus,
  privacy: row.privacy as VideoPrivacy,
})

const toSegment = (row: SegmentRow): VideoSegment => ({ ...row, kind: row.kind as SegmentKind })

export class DrizzleVideoRepository implements VideoRepository {
  constructor(private readonly db: Database) {}

  async create(video: Video): Promise<void> {
    await this.db.insert(videos).values(video)
  }

  async findById(id: string): Promise<Video | null> {
    const [row] = await this.db.select().from(videos).where(eq(videos.id, id)).limit(1)
    return row ? toVideo(row) : null
  }

  async update(video: Video): Promise<void> {
    const { id, ...fields } = video
    await this.db.update(videos).set(fields).where(eq(videos.id, id))
  }

  async upsertSegment(segment: VideoSegment): Promise<void> {
    await this.db
      .insert(videoSegments)
      .values(segment)
      .onConflictDoUpdate({
        target: [videoSegments.videoId, videoSegments.kind, videoSegments.index],
        set: {
          startMs: segment.startMs,
          byteLength: segment.byteLength,
          sha256: segment.sha256,
          uploadedAt: segment.uploadedAt,
        },
      })
  }

  async findSegment(videoId: string, kind: SegmentKind, index: number) {
    const [row] = await this.db
      .select()
      .from(videoSegments)
      .where(this.segmentMatch(videoId, kind, index))
      .limit(1)
    return row ? toSegment(row) : null
  }

  async markSegmentUploaded(videoId: string, kind: SegmentKind, index: number, at: Date) {
    await this.db
      .update(videoSegments)
      .set({ uploadedAt: at })
      .where(this.segmentMatch(videoId, kind, index))
  }

  async listSegments(videoId: string): Promise<VideoSegment[]> {
    const rows = await this.db
      .select()
      .from(videoSegments)
      .where(eq(videoSegments.videoId, videoId))
    return rows.map(toSegment)
  }

  private segmentMatch(videoId: string, kind: SegmentKind, index: number) {
    return and(
      eq(videoSegments.videoId, videoId),
      eq(videoSegments.kind, kind),
      eq(videoSegments.index, index),
    )
  }
}
