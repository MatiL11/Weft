import {
  CompleteRecording,
  ConfirmSegmentUpload,
  CreateWorkspace,
  PrepareSegmentUpload,
  RenderVideo,
  StartRecording,
  TranscribeVideo,
  type WorkspaceRepository,
} from '@weft/core'
import {
  FakeAccessTokens,
  FakeMediaRenderer,
  FakeObjectStorage,
  FakePasswordHasher,
  FakeNotificationQueue,
  FakeRenderQueue,
  FakeSecretTokens,
  FakeSpeechRecognizer,
  FixedClock,
  InMemoryCommentRepository,
  InMemoryFolderRepository,
  InMemoryInvitationRepository,
  InMemoryUserDirectory,
  InMemoryViewRepository,
  InMemoryReactionRepository,
  InMemoryTranscriptRepository,
  RecordingEventPublisher,
  InMemoryVideoRepository,
  InMemoryWorkspaceRepository,
  SequentialIdGenerator,
} from '@weft/core/testing'
import { vi } from 'vitest'
import { FailureLimiter, HitLimiter, UnlockLimiter } from '../security'
import { videoUseCases } from '../use-cases'
import { createApp, type AppDeps, type SessionUser } from './app'

export const NOW = new Date('2026-10-15T12:00:00.000Z')

export interface TestAppOptions extends Partial<AppDeps> {
  /** Session user for every request; null = anonymous. Defaults to user_1. */
  user?: SessionUser | null
}

/** Builds the HTTP app wired to in-memory fakes. */
export function buildTestApp(options: TestAppOptions = {}) {
  const users = new InMemoryUserDirectory([
    { id: 'user_1', name: 'Ana', email: 'ana@example.com' },
    { id: 'user_2', name: 'Beto', email: 'beto@example.com' },
  ])
  const workspaces: WorkspaceRepository =
    options.workspaces ?? new InMemoryWorkspaceRepository(new Set(), users)
  const transcripts = new InMemoryTranscriptRepository()
  const videos = new InMemoryVideoRepository(transcripts.textOf)
  const storage = new FakeObjectStorage()
  const clock = new FixedClock(NOW)
  const renders = new FakeRenderQueue()
  const events = new RecordingEventPublisher()
  const adapters = {
    videos,
    workspaces,
    storage,
    renders,
    transcriptions: renders,
    transcripts,
    folders: new InMemoryFolderRepository(videos),
    notifications: new FakeNotificationQueue(),
    views: new InMemoryViewRepository(),
    comments: new InMemoryCommentRepository({ user_1: 'Ana', user_2: 'Beto' }),
    reactions: new InMemoryReactionRepository(),
    events,
    invitations: new InMemoryInvitationRepository(),
    users,
    tokens: new FakeSecretTokens(),
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
    reactionLimiter: new HitLimiter(3, 60_000),
    commentLimiter: new HitLimiter(100, 60_000),
    inviteLimiter: new HitLimiter(100, 60_000),
    viewLimiter: new HitLimiter(3, 60_000),
    videoEvents: events,
    heartbeatMs: 50,
    unlockLimiter: new UnlockLimiter(
      new FailureLimiter(2, 60_000),
      new FailureLimiter(100, 60_000),
    ),
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
    events,
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

/** Runs every queued transcription with a fake recognizer (Spanish when auto-detecting). */
export async function runTranscriptions(ctx: TestApp) {
  const transcribe = new TranscribeVideo({
    ...ctx.adapters,
    recognizer: new FakeSpeechRecognizer(),
  })
  for (const job of ctx.renders.transcriptionJobs.splice(0)) await transcribe.execute(job)
}

export function sendJson(method: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }
}
