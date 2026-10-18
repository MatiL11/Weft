import type {
  RenderState,
  SegmentKind,
  TranscriptionState,
  TranscriptLanguage,
  Video,
  VideoPrivacy,
  VideoRender,
  VideoRepository,
  VideoSegment,
  VideoStatus,
} from '@weft/core'
import type { VideoListFilter } from '@weft/core'
import { and, desc, eq, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import type { Database } from './client'
import { transcripts, videoSegments, videos } from './schema'

type VideoRow = typeof videos.$inferSelect
type SegmentRow = typeof videoSegments.$inferSelect

const toVideo = ({ trimStartMs, trimEndMs, ...row }: VideoRow): Video => ({
  ...row,
  status: row.status as VideoStatus,
  privacy: row.privacy as VideoPrivacy,
  renderState: row.renderState as RenderState,
  transcriptLanguage: row.transcriptLanguage as TranscriptLanguage,
  transcriptionState: row.transcriptionState as TranscriptionState,
  trim:
    trimStartMs !== null && trimEndMs !== null ? { startMs: trimStartMs, endMs: trimEndMs } : null,
})

/** Columns the owner and recorder change; render and transcription progress is excluded. */
const editableColumns = (video: Video) => ({
  workspaceId: video.workspaceId,
  ownerId: video.ownerId,
  title: video.title,
  status: video.status,
  privacy: video.privacy,
  createdAt: video.createdAt,
  completedAt: video.completedAt,
  durationMs: video.durationMs,
  trimStartMs: video.trim?.startMs ?? null,
  trimEndMs: video.trim?.endMs ?? null,
  passwordHash: video.passwordHash,
  transcriptLanguage: video.transcriptLanguage,
  folderId: video.folderId,
  trashedAt: video.trashedAt,
})

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/** Case- and accent-insensitive "contains". */
const contains = (column: SQL | typeof videos.title, text: string) =>
  sql`lower(unaccent(${column})) like lower(unaccent(${likePattern(text)}))`

const toSegment = (row: SegmentRow): VideoSegment => ({ ...row, kind: row.kind as SegmentKind })

export class DrizzleVideoRepository implements VideoRepository {
  constructor(private readonly db: Database) {}

  async create(video: Video): Promise<void> {
    await this.db.insert(videos).values({
      id: video.id,
      ...editableColumns(video),
      renderState: video.renderState,
      renderVersion: video.renderVersion,
      render: video.render,
      transcriptionState: video.transcriptionState,
      transcriptionVersion: video.transcriptionVersion,
    })
  }

  async findById(id: string): Promise<Video | null> {
    const [row] = await this.db.select().from(videos).where(eq(videos.id, id)).limit(1)
    return row ? toVideo(row) : null
  }

  async listForWorkspace(workspaceId: string, filter: VideoListFilter): Promise<Video[]> {
    const conditions = [
      eq(videos.workspaceId, workspaceId),
      filter.trashed ? isNotNull(videos.trashedAt) : isNull(videos.trashedAt),
    ]
    if (filter.folderId !== undefined) {
      conditions.push(
        filter.folderId === null ? isNull(videos.folderId) : eq(videos.folderId, filter.folderId),
      )
    }
    if (filter.search) {
      const transcriptText = sql`coalesce(${transcripts.text}, '')`
      conditions.push(
        or(contains(videos.title, filter.search), contains(transcriptText, filter.search)) as SQL,
      )
    }
    const rows = await this.db
      .select({ video: videos })
      .from(videos)
      .leftJoin(transcripts, eq(transcripts.videoId, videos.id))
      .where(and(...conditions))
      .orderBy(desc(videos.createdAt))
      .limit(filter.limit)
    return rows.map((row) => toVideo(row.video))
  }

  async listTrashedBefore(cutoff: Date, options: { limit: number }): Promise<Video[]> {
    const rows = await this.db
      .select()
      .from(videos)
      .where(and(isNotNull(videos.trashedAt), lt(videos.trashedAt, cutoff)))
      .limit(options.limit)
    return rows.map(toVideo)
  }

  async update(video: Video): Promise<void> {
    await this.db.update(videos).set(editableColumns(video)).where(eq(videos.id, video.id))
  }

  async requestRender(id: string): Promise<number | null> {
    const [row] = await this.db
      .update(videos)
      .set({ renderVersion: sql`${videos.renderVersion} + 1`, renderState: 'queued' })
      .where(eq(videos.id, id))
      .returning({ version: videos.renderVersion })
    return row?.version ?? null
  }

  async saveRender(
    id: string,
    version: number,
    update: { state: RenderState; render?: VideoRender },
  ): Promise<boolean> {
    const rows = await this.db
      .update(videos)
      .set({ renderState: update.state, ...(update.render ? { render: update.render } : {}) })
      .where(and(eq(videos.id, id), eq(videos.renderVersion, version)))
      .returning({ id: videos.id })
    return rows.length > 0
  }

  async requestTranscription(id: string): Promise<number | null> {
    const [row] = await this.db
      .update(videos)
      .set({
        transcriptionVersion: sql`${videos.transcriptionVersion} + 1`,
        transcriptionState: 'queued',
      })
      .where(eq(videos.id, id))
      .returning({ version: videos.transcriptionVersion })
    return row?.version ?? null
  }

  async saveTranscription(id: string, version: number, state: TranscriptionState) {
    const rows = await this.db
      .update(videos)
      .set({ transcriptionState: state })
      .where(and(eq(videos.id, id), eq(videos.transcriptionVersion, version)))
      .returning({ id: videos.id })
    return rows.length > 0
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

  async delete(id: string): Promise<void> {
    // Segments go with it (ON DELETE CASCADE).
    await this.db.delete(videos).where(eq(videos.id, id))
  }

  private segmentMatch(videoId: string, kind: SegmentKind, index: number) {
    return and(
      eq(videoSegments.videoId, videoId),
      eq(videoSegments.kind, kind),
      eq(videoSegments.index, index),
    )
  }
}
