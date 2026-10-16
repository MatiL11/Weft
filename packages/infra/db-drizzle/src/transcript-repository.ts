import type { Transcript, TranscriptRepository } from '@weft/core'
import { eq } from 'drizzle-orm'
import type { Database } from './client'
import { transcripts } from './schema'

export class DrizzleTranscriptRepository implements TranscriptRepository {
  constructor(private readonly db: Database) {}

  async save(transcript: Transcript): Promise<void> {
    const { videoId, ...fields } = transcript
    const row = { ...fields, segments: [...fields.segments] }
    await this.db
      .insert(transcripts)
      .values({ videoId, ...row })
      .onConflictDoUpdate({ target: transcripts.videoId, set: row })
  }

  async find(videoId: string): Promise<Transcript | null> {
    const [row] = await this.db
      .select()
      .from(transcripts)
      .where(eq(transcripts.videoId, videoId))
      .limit(1)
    return row ?? null
  }
}
