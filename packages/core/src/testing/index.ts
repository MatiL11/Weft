// In-memory fakes of core ports, for fast use-case tests in any package.
import type { SegmentKind, Video, VideoSegment } from '../domain/video'
import type { Workspace, WorkspaceMembership, WorkspaceRole } from '../domain/workspace'
import type {
  Clock,
  IdGenerator,
  ObjectStorage,
  PresignedUpload,
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

  async update(video: Video): Promise<void> {
    this.videos.set(video.id, video)
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

  async presignGet(key: string): Promise<string> {
    return `fake-get://${key}`
  }

  async head(key: string): Promise<{ byteLength: number } | null> {
    const byteLength = this.objects.get(key)
    return byteLength === undefined ? null : { byteLength }
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(prefix)) this.objects.delete(key)
    }
  }

  simulateUpload(key: string, byteLength: number): void {
    this.objects.set(key, byteLength)
  }

  /** Stored object keys, for assertions. */
  keys(): string[] {
    return [...this.objects.keys()]
  }
}
