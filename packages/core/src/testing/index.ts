// In-memory fakes of core ports, for fast use-case tests in any package.
import type { View } from '../domain/analytics'
import type { Comment, CommentWithAuthor, Reaction } from '../domain/collaboration'
import type { RenderOutput, RenderState, TrimRange, VideoRender } from '../domain/render'
import type {
  Transcript,
  TranscriptionState,
  TranscriptLanguage,
  TranscriptSegment,
} from '../domain/transcript'
import type { SegmentKind, Video, VideoSegment } from '../domain/video'
import { foldForSearch, type Folder } from '../domain/library'
import type { Invitation, Member } from '../domain/membership'
import type {
  EmailLocale,
  EmailMessage,
  Notification,
  NotificationContent,
} from '../domain/notification'
import type { Workspace, WorkspaceMembership, WorkspaceRole } from '../domain/workspace'
import type {
  Clock,
  CommentRepository,
  ReactionRepository,
  VideoEvent,
  VideoEventPublisher,
  IdGenerator,
  EmailTemplates,
  FolderRepository,
  Mailer,
  NotificationQueue,
  InvitationRepository,
  VideoListFilter,
  ViewRepository,
  MediaRenderer,
  SecretTokens,
  UserDirectory,
  UserProfile,
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
  joinedAt: Date
}

/** Accounts in memory; tests register the people they need. */
export class InMemoryUserDirectory implements UserDirectory {
  private users: readonly UserProfile[]

  constructor(users: UserProfile[] = []) {
    this.users = users
  }

  add(user: UserProfile): void {
    this.users = [...this.users, user]
  }

  async findById(id: string): Promise<UserProfile | null> {
    return this.users.find((u) => u.id === id) ?? null
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null
  }

  async findByIds(ids: readonly string[]): Promise<UserProfile[]> {
    return this.users.filter((u) => ids.includes(u.id))
  }
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private workspaces: readonly Workspace[] = []
  private memberships: readonly StoredMembership[] = []

  /**
   * @param reservedSlugs slugs treated as already taken (for collision tests).
   * @param users where member names and emails come from.
   */
  constructor(
    private readonly reservedSlugs: ReadonlySet<string> = new Set(),
    private readonly users: UserDirectory = new InMemoryUserDirectory(),
  ) {}

  async slugExists(slug: string): Promise<boolean> {
    return this.reservedSlugs.has(slug) || this.workspaces.some((w) => w.slug === slug)
  }

  async createWithMember(workspace: Workspace, userId: string, role: WorkspaceRole): Promise<void> {
    this.workspaces = [...this.workspaces, workspace]
    this.memberships = [
      ...this.memberships,
      { workspaceId: workspace.id, userId, role, joinedAt: workspace.createdAt },
    ]
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
    if (await this.roleOf(workspaceId, userId)) return
    this.memberships = [...this.memberships, { workspaceId, userId, role, joinedAt: new Date(0) }]
  }

  async setRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
    this.memberships = this.memberships.map((m) =>
      m.workspaceId === workspaceId && m.userId === userId ? { ...m, role } : m,
    )
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    this.memberships = this.memberships.filter(
      (m) => !(m.workspaceId === workspaceId && m.userId === userId),
    )
  }

  async findById(id: string): Promise<Workspace | null> {
    return this.workspaces.find((w) => w.id === id) ?? null
  }

  async listMembers(workspaceId: string): Promise<Member[]> {
    const members = await Promise.all(
      this.memberships
        .filter((m) => m.workspaceId === workspaceId)
        .map(async (m) => {
          const user = await this.users.findById(m.userId)
          return {
            userId: m.userId,
            name: user?.name ?? m.userId,
            email: user?.email ?? '',
            role: m.role,
            joinedAt: m.joinedAt,
          }
        }),
    )
    return members.sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'))
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

  /** @param transcriptText a video's transcript as plain text, for searches. */
  constructor(private readonly transcriptText: (videoId: string) => string = () => '') {}

  async create(video: Video): Promise<void> {
    this.videos.set(video.id, video)
  }

  async findById(id: string): Promise<Video | null> {
    return this.videos.get(id) ?? null
  }

  async listForWorkspace(workspaceId: string, filter: VideoListFilter): Promise<Video[]> {
    const needle = filter.search ? foldForSearch(filter.search) : null
    return [...this.videos.values()]
      .filter((v) => v.workspaceId === workspaceId)
      .filter((v) => (v.trashedAt !== null) === filter.trashed)
      .filter((v) =>
        filter.trashed
          ? v.ownerId === filter.viewerId
          : v.privacy !== 'private' || v.ownerId === filter.viewerId,
      )
      .filter((v) => filter.folderId === undefined || v.folderId === filter.folderId)
      .filter(
        (v) =>
          !needle ||
          foldForSearch(v.title).includes(needle) ||
          ((v.privacy !== 'password' || v.ownerId === filter.viewerId) &&
            foldForSearch(this.transcriptText(v.id)).includes(needle)),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filter.limit)
  }

  async listTrashedBefore(cutoff: Date, options: { limit: number }): Promise<Video[]> {
    return [...this.videos.values()]
      .filter((v) => v.trashedAt !== null && v.trashedAt.getTime() < cutoff.getTime())
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

  /** Moves a deleted folder's videos to the top level (like ON DELETE SET NULL). */
  async clearFolder(folderId: string): Promise<void> {
    for (const [id, video] of this.videos) {
      if (video.folderId === folderId) this.videos.set(id, { ...video, folderId: null })
    }
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

  /** Plain text of a video's transcript ('' without one). */
  textOf = (videoId: string): string =>
    this.transcripts
      .get(videoId)
      ?.segments.map((s) => s.text)
      .join(' ') ?? ''

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

/** Comments in memory; author names come from the given user directory. */
export class InMemoryCommentRepository implements CommentRepository {
  private readonly comments = new Map<string, Comment>()

  constructor(private readonly userNames: Record<string, string> = {}) {}

  async create(comment: Comment): Promise<void> {
    this.comments.set(comment.id, comment)
  }

  async update(comment: Comment): Promise<void> {
    this.comments.set(comment.id, comment)
  }

  async findById(id: string): Promise<CommentWithAuthor | null> {
    const comment = this.comments.get(id)
    return comment ? this.withAuthor(comment) : null
  }

  async listForVideo(videoId: string): Promise<CommentWithAuthor[]> {
    return [...this.comments.values()]
      .filter((c) => c.videoId === videoId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((c) => this.withAuthor(c))
  }

  private withAuthor(comment: Comment): CommentWithAuthor {
    const name = this.userNames[comment.authorId] ?? comment.authorId
    return { ...comment, author: { id: comment.authorId, name } }
  }
}

export class InMemoryReactionRepository implements ReactionRepository {
  private reactions: readonly Reaction[] = []

  async create(reaction: Reaction): Promise<void> {
    this.reactions = [...this.reactions, reaction]
  }

  async listForVideo(videoId: string, options: { limit: number }): Promise<Reaction[]> {
    return this.reactions.filter((r) => r.videoId === videoId).slice(-options.limit)
  }
}

/** Keeps every published event, for assertions, and delivers them to subscribers. */
export class RecordingEventPublisher implements VideoEventPublisher {
  readonly events: VideoEvent[] = []
  private readonly listeners = new Set<{ videoId: string; listener: (e: VideoEvent) => void }>()

  async publish(event: VideoEvent): Promise<void> {
    this.events.push(event)
    for (const entry of this.listeners) {
      if (entry.videoId === event.videoId) entry.listener(event)
    }
  }

  async subscribe(videoId: string, listener: (event: VideoEvent) => void): Promise<() => void> {
    const entry = { videoId, listener }
    this.listeners.add(entry)
    return () => this.listeners.delete(entry)
  }
}

export class InMemoryInvitationRepository implements InvitationRepository {
  private readonly invitations = new Map<string, Invitation>()

  async create(invitation: Invitation): Promise<void> {
    this.invitations.set(invitation.id, invitation)
  }

  async update(invitation: Invitation): Promise<void> {
    this.invitations.set(invitation.id, invitation)
  }

  async findById(id: string): Promise<Invitation | null> {
    return this.invitations.get(id) ?? null
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    return [...this.invitations.values()].find((i) => i.tokenHash === tokenHash) ?? null
  }

  async listOpen(workspaceId: string): Promise<Invitation[]> {
    return [...this.invitations.values()].filter(
      (i) => i.workspaceId === workspaceId && !i.acceptedAt && !i.revokedAt,
    )
  }
}

/** Predictable tokens: tok_1, tok_2… hashed as "hash:<token>". */
export class FakeSecretTokens implements SecretTokens {
  private counter = 0

  create(): string {
    this.counter += 1
    return `tok_${this.counter}`
  }

  hash(token: string): string {
    return `hash:${token}`
  }
}

export class InMemoryFolderRepository implements FolderRepository {
  private readonly folders = new Map<string, Folder>()

  /** @param videos where a deleted folder's videos move to the top level. */
  constructor(private readonly videos?: InMemoryVideoRepository) {}

  async create(folder: Folder): Promise<void> {
    this.folders.set(folder.id, folder)
  }

  async update(folder: Folder): Promise<void> {
    this.folders.set(folder.id, folder)
  }

  async delete(id: string): Promise<void> {
    this.folders.delete(id)
    await this.videos?.clearFolder(id)
  }

  async findById(id: string): Promise<Folder | null> {
    return this.folders.get(id) ?? null
  }

  async listForWorkspace(workspaceId: string): Promise<Folder[]> {
    return [...this.folders.values()]
      .filter((f) => f.workspaceId === workspaceId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }
}

/** Records queued notifications, honoring dedupe keys only by recording them. */
export class FakeNotificationQueue implements NotificationQueue {
  readonly sent: { notification: Notification; dedupeKey?: string }[] = []
  failing = false

  async notify(notification: Notification, options?: { dedupeKey: string }): Promise<void> {
    if (this.failing) throw new Error('queue unavailable')
    this.sent.push({ notification, dedupeKey: options?.dedupeKey })
  }
}

/** Renders a compact, assertable summary instead of real email templates. */
export class FakeEmailTemplates implements EmailTemplates {
  render(content: NotificationContent, locale: EmailLocale) {
    const summary = JSON.stringify({ ...content, locale })
    return { subject: `${content.kind}:${locale}`, text: summary, html: `<p>${summary}</p>` }
  }
}

export class FakeMailer implements Mailer {
  readonly outbox: EmailMessage[] = []

  async send(message: EmailMessage): Promise<void> {
    this.outbox.push(message)
  }
}

export class InMemoryViewRepository implements ViewRepository {
  private readonly views = new Map<string, View>()

  async create(view: View): Promise<void> {
    this.views.set(view.id, view)
  }

  async mergeProgress(
    id: string,
    progress: { buckets: number; watchedMs: number; maxWatchedMs: number; at: Date },
  ): Promise<void> {
    const view = this.views.get(id)
    if (!view) return
    this.views.set(id, {
      ...view,
      buckets: view.buckets | progress.buckets,
      watchedMs: Math.min(progress.maxWatchedMs, Math.max(view.watchedMs, progress.watchedMs)),
      lastSeenAt: progress.at,
    })
  }

  async findById(id: string): Promise<View | null> {
    return this.views.get(id) ?? null
  }

  async listForVideo(videoId: string, options: { limit: number }): Promise<View[]> {
    return [...this.views.values()]
      .filter((v) => v.videoId === videoId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, options.limit)
  }

  async countForVideos(videoIds: readonly string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    for (const view of this.views.values()) {
      if (videoIds.includes(view.videoId))
        counts.set(view.videoId, (counts.get(view.videoId) ?? 0) + 1)
    }
    return counts
  }
}
