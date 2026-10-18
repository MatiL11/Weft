import { DomainError } from '../domain/errors'
import { normalizeTrim, sameTrim, type TrimRange } from '../domain/render'
import { validateTranscriptLanguage, type TranscriptLanguage } from '../domain/transcript'
import { normalizeTitle, type Video, type VideoPrivacy } from '../domain/video'
import type {
  PasswordHasher,
  RenderQueue,
  TranscriptionQueue,
  VideoRepository,
  WorkspaceRepository,
} from '../ports'
import { validatePassword } from './playback'
import { loadOwnVideo, loadVideo } from './recording'
import { queueRender } from './rendering'
import { queueTranscription } from './transcription'

export interface ManagementDeps {
  videos: VideoRepository
  workspaces: WorkspaceRepository
  renders: RenderQueue
  transcriptions: TranscriptionQueue
  passwords: PasswordHasher
}

export interface VideoChanges {
  title?: string
  privacy?: VideoPrivacy
  /** Required when switching to 'password'; when already protected, replaces the password. */
  password?: string
  /** null removes the trim. */
  trim?: TrimRange | null
  /** Spoken language for the transcript; changing it transcribes again. */
  transcriptLanguage?: TranscriptLanguage
}

/** Owner edits: title, privacy (with password) and trim. A new trim triggers a re-render. */
export class UpdateVideo {
  constructor(private readonly deps: ManagementDeps) {}

  async execute(input: VideoChanges & { userId: string; videoId: string }): Promise<Video> {
    const video = await loadOwnVideo(this.deps.videos, input.userId, input.videoId)
    const title = input.title === undefined ? video.title : normalizeTitle(input.title)
    const privacy = input.privacy ?? video.privacy
    const passwordHash = await this.passwordHashFor(video, privacy, input.password)
    const trim = input.trim === undefined ? video.trim : this.validTrim(video, input.trim)
    const transcriptLanguage =
      input.transcriptLanguage === undefined
        ? video.transcriptLanguage
        : validateTranscriptLanguage(input.transcriptLanguage)

    await this.deps.videos.update({
      ...video,
      title,
      privacy,
      passwordHash,
      trim,
      transcriptLanguage,
    })
    if (!sameTrim(trim, video.trim)) {
      // The new render will queue its own transcription.
      await queueRender(this.deps, video.id)
    } else if (transcriptLanguage !== video.transcriptLanguage && video.render) {
      await queueTranscription(this.deps, video.id)
    }
    return loadVideo(this.deps.videos, video.id)
  }

  private async passwordHashFor(video: Video, privacy: VideoPrivacy, password?: string) {
    if (privacy !== 'password') return null
    if (password !== undefined) {
      validatePassword(password)
      return this.deps.passwords.hash(password)
    }
    if (video.passwordHash) return video.passwordHash
    throw new DomainError('video.password_missing', 'Choose a password to protect this video.')
  }

  private validTrim(video: Video, trim: TrimRange | null) {
    if (video.status !== 'ready' || video.durationMs === null) {
      throw new DomainError('video.not_ready', 'Videos can be trimmed once recording ends.')
    }
    return normalizeTrim(trim, video.durationMs)
  }
}

/** Retries a render (e.g. after a failure). Owner only. */
export class RequestRender {
  constructor(private readonly deps: ManagementDeps) {}

  async execute(input: { userId: string; videoId: string }): Promise<Video> {
    const video = await loadOwnVideo(this.deps.videos, input.userId, input.videoId)
    if (video.status !== 'ready') {
      throw new DomainError('video.not_ready', 'Only finished recordings can be processed.')
    }
    await queueRender(this.deps, video.id)
    return loadVideo(this.deps.videos, video.id)
  }
}

/** Transcribes the current render again (e.g. after a failure). Owner only. */
export class RequestTranscription {
  constructor(private readonly deps: ManagementDeps) {}

  async execute(input: { userId: string; videoId: string }): Promise<Video> {
    const video = await loadOwnVideo(this.deps.videos, input.userId, input.videoId)
    if (!video.render) {
      throw new DomainError('video.not_ready', 'Videos are transcribed once they are processed.')
    }
    await queueTranscription(this.deps, video.id)
    return loadVideo(this.deps.videos, video.id)
  }
}
