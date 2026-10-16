import { renderPrefix } from '../domain/render'
import { normalizeSegments } from '../domain/transcript'
import type {
  Clock,
  SpeechRecognizer,
  TranscriptionJob,
  TranscriptionQueue,
  TranscriptRepository,
  VideoRepository,
} from '../ports'

/** Requests a new transcription; an unreachable queue marks it failed so it can be retried. */
export async function queueTranscription(
  deps: { videos: VideoRepository; transcriptions: TranscriptionQueue },
  videoId: string,
): Promise<void> {
  const version = await deps.videos.requestTranscription(videoId)
  if (version === null) return
  try {
    await deps.transcriptions.enqueueTranscription({ videoId, version })
  } catch {
    await deps.videos.saveTranscription(videoId, version, 'failed')
  }
}

export interface TranscribeDeps {
  videos: VideoRepository
  transcripts: TranscriptRepository
  recognizer: SpeechRecognizer
  clock: Clock
}

export type TranscribeResult = 'transcribed' | 'no_audio' | 'stale'

/**
 * Background job: transcribes the video's current render, so the timestamps follow its
 * (trimmed) timeline. Each new render queues a new transcription.
 */
export class TranscribeVideo {
  constructor(private readonly deps: TranscribeDeps) {}

  async execute(job: TranscriptionJob): Promise<TranscribeResult> {
    const { videos, transcripts, recognizer, clock } = this.deps
    const video = await videos.findById(job.videoId)
    if (!video?.render || video.transcriptionVersion !== job.version) return 'stale'
    const { render } = video
    if (render.hasAudio === false) {
      await videos.saveTranscription(video.id, job.version, 'no_audio')
      return 'no_audio'
    }
    if (!(await videos.saveTranscription(video.id, job.version, 'processing'))) return 'stale'

    let result
    try {
      result = await recognizer.transcribe({
        mediaKey: `${renderPrefix(video.id, render.version)}video.mp4`,
        language: video.transcriptLanguage,
      })
    } catch (error) {
      await videos.saveTranscription(video.id, job.version, 'failed')
      throw error
    }

    if (result === null) {
      await videos.saveTranscription(video.id, job.version, 'no_audio')
      return 'no_audio'
    }
    const current = await videos.findById(video.id)
    if (current?.transcriptionVersion !== job.version) return 'stale'
    await transcripts.save({
      videoId: video.id,
      renderVersion: render.version,
      language: result.language,
      segments: normalizeSegments(result.segments, render.durationMs),
      createdAt: clock.now(),
    })
    return (await videos.saveTranscription(video.id, job.version, 'ready'))
      ? 'transcribed'
      : 'stale'
  }
}
