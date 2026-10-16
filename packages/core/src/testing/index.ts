// In-memory fakes of core ports, for fast use-case tests in any package.
import type { RenderOutput, RenderState, TrimRange, VideoRender } from '../domain/render'
import type {
  Transcript,
  TranscriptionState,
  TranscriptLanguage,
  TranscriptSegment,
} from '../domain/transcript'
import type { SegmentKind, Video, VideoSegment } from '../domain/video'
import type { Workspace, WorkspaceMembership, WorkspaceRole } from '../domain/workspace'
import type {
  Clock,
  IdGenerator,
  MediaRenderer,
  ObjectStorage,
  PasswordHasher,
  PresignedUpload,
  RenderJob,
  RenderQueue,
  SpeechRecognizer,
  TranscriptionJob,
  TranscriptionQueue,
  TranscriptRepository,
  VideoAccessTokens,
  VideoRepository,
  WorkspaceRepository,
} from '../ports'

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

  /** Test helper: adds a member to an existing workspace. */
  async addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
    this.memberships = [...this.memberships, { workspaceId, userId, role }]
  }

  async roleOf(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    return (
      this.memberships.find((m) => m.workspaceId === workspaceId && m.userId === userId)?.role ??
      null
    )
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

const segmentId = (videoId: string, kind: SegmentKind, index: number) =>
  `${videoId}/${kind}/${index}`

export class InMemoryVideoRepository implements VideoRepository {
  private readonly videos = new Map<string, Video>()
  private readonly segments = new Map<string, VideoSegment>()

  async create(video: Video): Promise<void> {
    this.videos.set(video.id, video)
  }

  async findById(id: string): Promise<Video | null> {
    return this.videos.get(id) ?? null
  }

  async listForWorkspace(workspaceId: string, options: { limit: number }): Promise<Video[]> {
    return [...this.videos.values()]
      .filter((v) => v.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, options.limit)
  }

  async update(video: Video): Promise<void> {
    const current = this.videos.get(video.id)
    if (!current) return
    const { renderState, renderVersion, render, transcriptionState, transcriptionVersion } = current
    this.videos.set(video.id, {
      ...video,
      renderState,
      renderVersion,
      render,
      transcriptionState,
      transcriptionVersion,
    })
  }

  async requestRender(id: string): Promise<number | null> {
    const video = this.videos.get(id)
    if (!video) return null
    const renderVersion = video.renderVersion + 1
    this.videos.set(id, { ...video, renderVersion, renderState: 'queued' })
    return renderVersion
  }

  async saveRender(
    id: string,
    version: number,
    update: { state: RenderState; render?: VideoRender },
  ): Promise<boolean> {
    const video = this.videos.get(id)
    if (!video || video.renderVersion !== version) return false
    this.videos.set(id, {
      ...video,
      renderState: update.state,
      render: update.render ?? video.render,
    })
    return true
  }

  async requestTranscription(id: string): Promise<number | null> {
    const video = this.videos.get(id)
    if (!video) return null
    const transcriptionVersion = video.transcriptionVersion + 1
    this.videos.set(id, { ...video, transcriptionVersion, transcriptionState: 'queued' })
    return transcriptionVersion
  }

  async saveTranscription(id: string, version: number, state: TranscriptionState) {
    const video = this.videos.get(id)
    if (!video || video.transcriptionVersion !== version) return false
    this.videos.set(id, { ...video, transcriptionState: state })
    return true
  }

  async upsertSegment(segment: VideoSegment): Promise<void> {
    this.segments.set(segmentId(segment.videoId, segment.kind, segment.index), segment)
  }

  async findSegment(videoId: string, kind: SegmentKind, index: number) {
    return this.segments.get(segmentId(videoId, kind, index)) ?? null
  }

  async markSegmentUploaded(videoId: string, kind: SegmentKind, index: number, at: Date) {
    const id = segmentId(videoId, kind, index)
    const segment = this.segments.get(id)
    if (segment) this.segments.set(id, { ...segment, uploadedAt: at })
  }

  async listSegments(videoId: string): Promise<VideoSegment[]> {
    return [...this.segments.values()].filter((s) => s.videoId === videoId)
  }

  async delete(id: string): Promise<void> {
    this.videos.delete(id)
    for (const [key, segment] of this.segments) {
      if (segment.videoId === id) this.segments.delete(key)
    }
  }
}

/** ObjectStorage fake with deterministic URLs; `simulateUpload` stands in for the browser's PUT. */
export class FakeObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, number>()
  private readonly texts = new Map<string, string>()

  constructor(private readonly clock: Clock = { now: () => new Date('2026-10-16T10:00:00Z') }) {}

  async presignPut(
    key: string,
    options: { byteLength: number; sha256: string; expiresInSeconds: number },
  ): Promise<PresignedUpload> {
    return {
      url: `fake-put://${key}?len=${options.byteLength}&sha=${options.sha256}`,
      expiresAt: new Date(this.clock.now().getTime() + options.expiresInSeconds * 1000),
    }
  }

  async presignGet(key: string, options?: { downloadFilename?: string }): Promise<string> {
    const download = options?.downloadFilename ? `?download=${options.downloadFilename}` : ''
    return `fake-get://${key}${download}`
  }

  async readText(key: string): Promise<string | null> {
    return this.texts.get(key) ?? null
  }

  async head(key: string): Promise<{ byteLength: number } | null> {
    const byteLength = this.objects.get(key)
    return byteLength === undefined ? null : { byteLength }
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(prefix)) this.objects.delete(key)
    }
    for (const key of [...this.texts.keys()]) {
      if (key.startsWith(prefix)) this.texts.delete(key)
    }
  }

  simulateUpload(key: string, byteLength: number): void {
    this.objects.set(key, byteLength)
  }

  /** Stores a text object, as a render's playlists would be. */
  putText(key: string, text: string): void {
    this.texts.set(key, text)
    this.objects.set(key, text.length)
  }

  /** Stored object keys, for assertions. */
  keys(): string[] {
    return [...this.objects.keys()]
  }
}

/** Records enqueued render and transcription jobs; `failing` simulates an unreachable queue. */
export class FakeRenderQueue implements RenderQueue, TranscriptionQueue {
  readonly jobs: RenderJob[] = []
  readonly transcriptionJobs: TranscriptionJob[] = []
  failing = false

  async enqueue(job: RenderJob): Promise<void> {
    if (this.failing) throw new Error('queue unavailable')
    this.jobs.push(job)
  }

  async enqueueTranscription(job: TranscriptionJob): Promise<void> {
    if (this.failing) throw new Error('queue unavailable')
    this.transcriptionJobs.push(job)
  }
}

export class InMemoryTranscriptRepository implements TranscriptRepository {
  private readonly transcripts = new Map<string, Transcript>()

  async save(transcript: Transcript): Promise<void> {
    this.transcripts.set(transcript.videoId, transcript)
  }

  async find(videoId: string): Promise<Transcript | null> {
    return this.transcripts.get(videoId) ?? null
  }
}

export const FAKE_TRANSCRIPT_SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 2500, text: 'Hola a todos.' },
  { startMs: 2500, endMs: 5000, text: 'Esta es la demo.' },
]

/** Returns a fixed transcript in the requested language ('es' when auto-detecting). */
export class FakeSpeechRecognizer implements SpeechRecognizer {
  readonly calls: { mediaKey: string; language: TranscriptLanguage }[] = []
  error: Error | null = null
  /** Simulates a video without sound. */
  silent = false

  async transcribe(input: { mediaKey: string; language: TranscriptLanguage }) {
    this.calls.push(input)
    if (this.error) throw this.error
    if (this.silent) return null
    return {
      language: input.language === 'auto' ? 'es' : input.language,
      segments: FAKE_TRANSCRIPT_SEGMENTS,
    }
  }
}

export const FAKE_RENDER_OUTPUT: RenderOutput = {
  durationMs: 6000,
  renditions: [{ width: 1280, height: 720, bandwidth: 2_000_000, codecs: 'avc1.64001f,mp4a.40.2' }],
  sprite: { columns: 10, count: 6, intervalMs: 1000, tileWidth: 160, tileHeight: 90 },
  mp4ByteLength: 123_456,
  hasAudio: true,
}

/** Writes a marker object under the output prefix and returns a fixed output. */
export class FakeMediaRenderer implements MediaRenderer {
  readonly calls: { sourceKeys: string[]; trim: TrimRange | null; outputPrefix: string }[] = []
  error: Error | null = null
  /** Runs during a render, e.g. to change the video concurrently. */
  during: (() => Promise<void>) | null = null

  constructor(private readonly storage: FakeObjectStorage) {}

  async render(input: { sourceKeys: string[]; trim: TrimRange | null; outputPrefix: string }) {
    this.calls.push(input)
    this.storage.simulateUpload(`${input.outputPrefix}video.mp4`, 1)
    await this.during?.()
    if (this.error) throw this.error
    return FAKE_RENDER_OUTPUT
  }
}

export class FakePasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return `hashed:${password}`
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return hash === `hashed:${password}`
  }
}

export class FakeAccessTokens implements VideoAccessTokens {
  issue(video: Video): string {
    return `token:${video.id}:${video.passwordHash}`
  }

  verify(video: Video, token: string): boolean {
    return token === this.issue(video)
  }
}
