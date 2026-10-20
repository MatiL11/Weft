import { DomainError } from '../domain/errors'
import {
  ABANDONED_RECORDING_MS,
  findMatchingSegment,
  normalizeFolderName,
  SEARCH_MAX_LENGTH,
  TRASH_RETENTION_MS,
  type Folder,
} from '../domain/library'
import { playbackSource } from '../domain/render'
import type { TranscriptSegment } from '../domain/transcript'
import { videoPrefix, type Video } from '../domain/video'
import type { WorkspaceRole } from '../domain/workspace'
import type {
  Clock,
  FolderRepository,
  IdGenerator,
  ObjectStorage,
  TranscriptRepository,
  VideoRepository,
  ViewRepository,
  WorkspaceRepository,
} from '../ports'
import { loadOwnVideo, loadVideo } from './recording'

export interface LibraryDeps {
  videos: VideoRepository
  workspaces: WorkspaceRepository
  folders: FolderRepository
  transcripts: TranscriptRepository
  views: ViewRepository
  storage: ObjectStorage
  ids: IdGenerator
  clock: Clock
}

const LIST_LIMIT = 100
const CONTRIBUTORS: ReadonlySet<WorkspaceRole> = new Set(['owner', 'admin', 'member'])
const MANAGERS: ReadonlySet<WorkspaceRole> = new Set(['owner', 'admin'])

async function requireRole(deps: LibraryDeps, workspaceId: string, userId: string) {
  const role = await deps.workspaces.roleOf(workspaceId, userId)
  if (!role) throw new DomainError('workspace.forbidden', 'You are not in this workspace.')
  return role
}

export interface LibraryItem {
  video: Video
  /** Where the search matched in the transcript, if it did. */
  match: TranscriptSegment | null
  /** Views so far; only for the caller's own videos. */
  viewCount: number | null
}

/**
 * Videos of a workspace the caller belongs to (others' private videos are left out), by
 * folder, in the trash (the caller's own only) or matching a search.
 */
export class ListVideos {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(input: {
    userId: string
    workspaceId: string
    folderId?: string | null
    search?: string
    trashed?: boolean
  }): Promise<LibraryItem[]> {
    await requireRole(this.deps, input.workspaceId, input.userId)
    const search = input.search?.trim().slice(0, SEARCH_MAX_LENGTH) || undefined
    const trashed = input.trashed ?? false
    const videos = await this.deps.videos.listForWorkspace(input.workspaceId, {
      limit: LIST_LIMIT,
      viewerId: input.userId,
      trashed,
      folderId: search || trashed ? undefined : input.folderId,
      search,
    })
    const own = videos.filter((v) => v.ownerId === input.userId).map((v) => v.id)
    const counts = own.length
      ? await this.deps.views.countForVideos(own)
      : new Map<string, number>()
    return Promise.all(
      videos.map(async (video) => ({
        video,
        match: search ? await this.matchIn(video, search, input.userId) : null,
        viewCount: video.ownerId === input.userId ? (counts.get(video.id) ?? 0) : null,
      })),
    )
  }

  private async matchIn(video: Video, search: string, viewerId: string) {
    // Others' password-protected videos never reveal what they say.
    if (video.privacy === 'password' && video.ownerId !== viewerId) return null
    // A transcript belongs to a render; one made before the current trim may quote cut footage.
    if (playbackSource(video).kind !== 'render') return null
    const transcript = await this.deps.transcripts.find(video.id)
    return transcript && transcript.renderVersion === video.render?.version
      ? findMatchingSegment(transcript.segments, search)
      : null
  }
}

export class ListFolders {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(input: { userId: string; workspaceId: string }): Promise<Folder[]> {
    await requireRole(this.deps, input.workspaceId, input.userId)
    return this.deps.folders.listForWorkspace(input.workspaceId)
  }
}

export class CreateFolder {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(input: { userId: string; workspaceId: string; name: string }): Promise<Folder> {
    const role = await requireRole(this.deps, input.workspaceId, input.userId)
    if (!CONTRIBUTORS.has(role))
      throw new DomainError('workspace.forbidden', 'Viewers cannot create folders.')
    const folder: Folder = {
      id: this.deps.ids.next(),
      workspaceId: input.workspaceId,
      name: normalizeFolderName(input.name),
      createdBy: input.userId,
      createdAt: this.deps.clock.now(),
    }
    await this.deps.folders.create(folder)
    return folder
  }
}

/** Loads a folder its creator, or a workspace owner or admin, may change. */
async function loadEditableFolder(deps: LibraryDeps, userId: string, folderId: string) {
  const folder = await deps.folders.findById(folderId)
  if (!folder) throw new DomainError('folder.not_found', 'Folder not found.')
  const role = await deps.workspaces.roleOf(folder.workspaceId, userId)
  if (!role) throw new DomainError('folder.not_found', 'Folder not found.')
  if (folder.createdBy !== userId && !MANAGERS.has(role)) {
    throw new DomainError(
      'folder.forbidden',
      'Only its creator or an admin can change this folder.',
    )
  }
  return folder
}

export class RenameFolder {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(input: { userId: string; folderId: string; name: string }): Promise<Folder> {
    const folder = await loadEditableFolder(this.deps, input.userId, input.folderId)
    const renamed = { ...folder, name: normalizeFolderName(input.name) }
    await this.deps.folders.update(renamed)
    return renamed
  }
}

/** Deletes a folder; its videos stay in the library, at the top level. */
export class DeleteFolder {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(input: { userId: string; folderId: string }): Promise<void> {
    const folder = await loadEditableFolder(this.deps, input.userId, input.folderId)
    await this.deps.folders.delete(folder.id)
  }
}

/** Puts one of the caller's videos in a folder of the same workspace (or the top level). */
export class MoveVideo {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(input: {
    userId: string
    videoId: string
    folderId: string | null
  }): Promise<Video> {
    const video = await loadOwnVideo(this.deps.videos, input.userId, input.videoId)
    if (input.folderId !== null) {
      const folder = await this.deps.folders.findById(input.folderId)
      if (!folder || folder.workspaceId !== video.workspaceId) {
        throw new DomainError('folder.not_found', 'Folder not found.')
      }
    }
    await this.deps.videos.update({ ...video, folderId: input.folderId })
    return loadVideo(this.deps.videos, video.id)
  }
}

/** Moves one of the caller's videos to the trash: its link stops working for others. */
export class TrashVideo {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(input: { userId: string; videoId: string }): Promise<Video> {
    const video = await loadOwnVideo(this.deps.videos, input.userId, input.videoId)
    if (!video.trashedAt)
      await this.deps.videos.update({ ...video, trashedAt: this.deps.clock.now() })
    return loadVideo(this.deps.videos, video.id)
  }
}

export class RestoreVideo {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(input: { userId: string; videoId: string }): Promise<Video> {
    const video = await loadOwnVideo(this.deps.videos, input.userId, input.videoId)
    await this.deps.videos.update({ ...video, trashedAt: null })
    return loadVideo(this.deps.videos, video.id)
  }
}

const PURGE_BATCH = 100

type PurgeDeps = Pick<LibraryDeps, 'videos' | 'storage' | 'clock'>

/** Deletes every video `listDue` returns, in batches; returns how many were deleted. */
async function purgeInBatches(
  deps: PurgeDeps,
  listDue: (options: { limit: number }) => Promise<Video[]>,
): Promise<number> {
  let total = 0
  for (;;) {
    const due = await listDue({ limit: PURGE_BATCH })
    // Files first: if that fails the row stays, and the next run tries again.
    for (const video of due) {
      await deps.storage.deletePrefix(videoPrefix(video.id))
      await deps.videos.delete(video.id)
    }
    total += due.length
    if (due.length < PURGE_BATCH) return total
  }
}

/** Background job: deletes for good the videos that have been in the trash long enough. */
export class PurgeTrash {
  constructor(private readonly deps: PurgeDeps) {}

  execute(): Promise<number> {
    const cutoff = new Date(this.deps.clock.now().getTime() - TRASH_RETENTION_MS)
    return purgeInBatches(this.deps, (options) =>
      this.deps.videos.listTrashedBefore(cutoff, options),
    )
  }
}

/** Background job: deletes recordings that were never finished (see ABANDONED_RECORDING_MS). */
export class PurgeAbandonedRecordings {
  constructor(private readonly deps: PurgeDeps) {}

  execute(): Promise<number> {
    const cutoff = new Date(this.deps.clock.now().getTime() - ABANDONED_RECORDING_MS)
    return purgeInBatches(this.deps, (options) =>
      this.deps.videos.listRecordingsStartedBefore(cutoff, options),
    )
  }
}
