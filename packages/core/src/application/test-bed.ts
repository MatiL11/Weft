// Shared setup for use-case tests: in-memory adapters plus helpers to record a video.
import {
  FakeAccessTokens,
  FakeMediaRenderer,
  FakeObjectStorage,
  FakePasswordHasher,
  FakeRenderQueue,
  FakeSpeechRecognizer,
  FakeSecretTokens,
  FixedClock,
  InMemoryCommentRepository,
  InMemoryInvitationRepository,
  InMemoryUserDirectory,
  InMemoryReactionRepository,
  InMemoryTranscriptRepository,
  RecordingEventPublisher,
  InMemoryVideoRepository,
  InMemoryWorkspaceRepository,
  SequentialIdGenerator,
} from '../testing'
import {
  CompleteRecording,
  ConfirmSegmentUpload,
  PrepareSegmentUpload,
  StartRecording,
} from './recording'

export const NOW = new Date('2026-10-16T10:00:00Z')
export const SHA = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg='

export async function createTestBed() {
  const videos = new InMemoryVideoRepository()
  const users = new InMemoryUserDirectory([
    { id: 'owner_1', name: 'Ana', email: 'ana@example.com' },
    { id: 'member_1', name: 'Beto', email: 'beto@example.com' },
    { id: 'viewer_1', name: 'Caro', email: 'caro@example.com' },
    { id: 'outsider', name: 'Dani', email: 'dani@example.com' },
  ])
  const workspaces = new InMemoryWorkspaceRepository(new Set(), users)
  const storage = new FakeObjectStorage()
  const renders = new FakeRenderQueue()
  const deps = {
    videos,
    workspaces,
    storage,
    renders,
    transcriptions: renders,
    transcripts: new InMemoryTranscriptRepository(),
    comments: new InMemoryCommentRepository({ owner_1: 'Ana', member_1: 'Beto', viewer_1: 'Caro' }),
    reactions: new InMemoryReactionRepository(),
    events: new RecordingEventPublisher(),
    users,
    invitations: new InMemoryInvitationRepository(),
    tokens: new FakeSecretTokens(),
    recognizer: new FakeSpeechRecognizer(),
    renderer: new FakeMediaRenderer(storage),
    passwords: new FakePasswordHasher(),
    accessTokens: new FakeAccessTokens(),
    ids: new SequentialIdGenerator('vid'),
    clock: new FixedClock(NOW),
  }
  await workspaces.createWithMember(
    { id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW },
    'owner_1',
    'owner',
  )
  await workspaces.addMember('ws_1', 'member_1', 'member')
  await workspaces.addMember('ws_1', 'viewer_1', 'viewer')

  const start = (userId = 'owner_1') =>
    new StartRecording(deps).execute({ userId, workspaceId: 'ws_1', title: 'Demo' })

  async function upload(videoId: string, kind: 'init' | 'media', index: number, startMs = 0) {
    const byteLength = 100 + index
    const prepared = await new PrepareSegmentUpload(deps).execute({
      userId: 'owner_1',
      videoId,
      kind,
      index,
      startMs,
      byteLength,
      sha256: SHA,
    })
    storage.simulateUpload(prepared.key, byteLength)
    await new ConfirmSegmentUpload(deps).execute({ userId: 'owner_1', videoId, kind, index })
    return prepared
  }

  /** A finished 6 s recording with two segments. */
  async function recorded() {
    const video = await start()
    await upload(video.id, 'init', 0)
    await upload(video.id, 'media', 0, 0)
    await upload(video.id, 'media', 1, 4000)
    return new CompleteRecording(deps).execute({
      userId: 'owner_1',
      videoId: video.id,
      durationMs: 6000,
      segmentCount: 2,
    })
  }

  return { deps, ...deps, start, upload, recorded }
}
