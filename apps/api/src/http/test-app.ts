import {
  CompleteRecording,
  ConfirmSegmentUpload,
  CreateWorkspace,
  PrepareSegmentUpload,
  RenderVideo,
  StartRecording,
  type WorkspaceRepository,
} from '@weft/core'
import {
  FakeAccessTokens,
  FakeMediaRenderer,
  FakeObjectStorage,
  FakePasswordHasher,
  FakeRenderQueue,
  FixedClock,
  InMemoryVideoRepository,
  InMemoryWorkspaceRepository,
  SequentialIdGenerator,
} from '@weft/core/testing'
import { vi } from 'vitest'
import { AttemptLimiter } from '../security'
import { videoUseCases } from '../use-cases'
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
  const renders = new FakeRenderQueue()
  const adapters = {
    videos,
    workspaces,
    storage,
    renders,
    passwords: new FakePasswordHasher(),
    accessTokens: new FakeAccessTokens(),
    ids: new SequentialIdGenerator('vid'),
    clock,
  }
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
    ...videoUseCases(adapters),
    unlockLimiter: new AttemptLimiter(3, 60_000),
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
    renders,
    /** Renders with the fake renderer, as the worker would. */
    renderer: new FakeMediaRenderer(storage),
    adapters,
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

type TestApp = ReturnType<typeof buildTestApp>

/** Creates the owner's workspace and a finished 6 s recording (vid_1), owned by user_1. */
export async function withRecordedVideo(ctx: TestApp) {
  await ctx.workspaces.createWithMember(
    { id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW },
    'user_1',
    'owner',
  )
  const deps = ctx.adapters
  const video = await new StartRecording(deps).execute({
    userId: 'user_1',
    workspaceId: 'ws_1',
    title: 'Demo',
  })
  for (const [kind, index, startMs] of [
    ['init', 0, 0],
    ['media', 0, 0],
    ['media', 1, 4000],
  ] as const) {
    const prepared = await new PrepareSegmentUpload(deps).execute({
      userId: 'user_1',
      videoId: video.id,
      kind,
      index,
      startMs,
      byteLength: 100,
      sha256: 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=',
    })
    ctx.storage.simulateUpload(prepared.key, 100)
    await new ConfirmSegmentUpload(deps).execute({
      userId: 'user_1',
      videoId: video.id,
      kind,
      index,
    })
  }
  return new CompleteRecording(deps).execute({
    userId: 'user_1',
    videoId: video.id,
    durationMs: 6000,
    segmentCount: 2,
  })
}

/** Runs every queued render, as the worker would. */
export async function runRenders(ctx: TestApp) {
  const render = new RenderVideo({ ...ctx.adapters, renderer: ctx.renderer })
  for (const job of ctx.renders.jobs.splice(0)) await render.execute(job)
}

export function sendJson(method: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }
}
