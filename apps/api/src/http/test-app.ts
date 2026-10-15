import {
  CompleteRecording,
  ConfirmSegmentUpload,
  CreateWorkspace,
  DeleteVideo,
  GetPlayback,
  PrepareSegmentUpload,
  StartRecording,
  type WorkspaceRepository,
} from '@weft/core'
import {
  FakeObjectStorage,
  FixedClock,
  InMemoryVideoRepository,
  InMemoryWorkspaceRepository,
  SequentialIdGenerator,
} from '@weft/core/testing'
import { vi } from 'vitest'
import { createApp, type AppDeps, type SessionUser } from './app'

export const NOW = new Date('2026-10-15T12:00:00.000Z')

export interface TestAppOptions extends Partial<AppDeps> {
  /** Session user for every request; null = anonymous. Defaults to user_1. */
  user?: SessionUser | null
}

/** Builds the HTTP app wired to in-memory fakes. */
export function buildTestApp(options: TestAppOptions = {}) {
  const workspaces: WorkspaceRepository = options.workspaces ?? new InMemoryWorkspaceRepository()
  const videos = new InMemoryVideoRepository()
  const storage = new FakeObjectStorage()
  const clock = new FixedClock(NOW)
  const recording = { videos, workspaces, storage, ids: new SequentialIdGenerator('vid'), clock }
  const logger = { error: vi.fn() }
  const authHandler = vi.fn(async () => new Response('auth', { status: 200 }))
  let user = options.user === undefined ? { id: 'user_1' } : options.user

  const app = createApp({
    authHandler,
    getSessionUser: async () => user,
    workspaces,
    createWorkspace: new CreateWorkspace({
      workspaces,
      ids: new SequentialIdGenerator('ws'),
      clock,
    }),
    startRecording: new StartRecording(recording),
    prepareSegmentUpload: new PrepareSegmentUpload(recording),
    confirmSegmentUpload: new ConfirmSegmentUpload(recording),
    completeRecording: new CompleteRecording(recording),
    deleteVideo: new DeleteVideo(recording),
    getPlayback: new GetPlayback(recording),
    publicUrl: 'https://weft.test',
    logger,
    ...options,
  })

  return {
    app,
    logger,
    authHandler,
    videos,
    storage,
    workspaces,
    /** Switches the session user for subsequent requests. */
    actAs(next: SessionUser | null) {
      user = next
    },
  }
}

export function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}
