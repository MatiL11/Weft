import {
  CompleteRecording,
  ConfirmSegmentUpload,
  DeleteVideo,
  GetPlayback,
  ListVideos,
  PrepareSegmentUpload,
  RequestRender,
  RequestTranscription,
  StartRecording,
  UnlockVideo,
  UpdateVideo,
  type Clock,
  type IdGenerator,
  type ObjectStorage,
  type PasswordHasher,
  type RenderQueue,
  type TranscriptionQueue,
  type TranscriptRepository,
  type VideoAccessTokens,
  type VideoRepository,
  type WorkspaceRepository,
} from '@weft/core'

export interface VideoAdapters {
  videos: VideoRepository
  workspaces: WorkspaceRepository
  storage: ObjectStorage
  renders: RenderQueue
  transcriptions: TranscriptionQueue
  transcripts: TranscriptRepository
  passwords: PasswordHasher
  accessTokens: VideoAccessTokens
  ids: IdGenerator
  clock: Clock
}

/** The video use cases the HTTP layer calls, wired to a set of adapters. */
export function videoUseCases(adapters: VideoAdapters) {
  return {
    startRecording: new StartRecording(adapters),
    prepareSegmentUpload: new PrepareSegmentUpload(adapters),
    confirmSegmentUpload: new ConfirmSegmentUpload(adapters),
    completeRecording: new CompleteRecording(adapters),
    deleteVideo: new DeleteVideo(adapters),
    updateVideo: new UpdateVideo(adapters),
    requestRender: new RequestRender(adapters),
    requestTranscription: new RequestTranscription(adapters),
    listVideos: new ListVideos(adapters),
    getPlayback: new GetPlayback(adapters),
    unlockVideo: new UnlockVideo(adapters),
  }
}
