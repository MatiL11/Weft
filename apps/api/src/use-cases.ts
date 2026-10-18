import {
  AcceptInvitation,
  AddComment,
  ChangeMemberRole,
  GetInvitation,
  InviteMember,
  ListMembers,
  RemoveMember,
  RevokeInvitation,
  AddReaction,
  CreateFolder,
  DeleteFolder,
  ListFolders,
  MoveVideo,
  RenameFolder,
  RestoreVideo,
  TrashVideo,
  AuthorizeViewer,
  GetVideoStats,
  RecordViewProgress,
  StartView,
  CompleteRecording,
  DeleteComment,
  EditComment,
  GetDiscussion,
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
  type FolderRepository,
  type ViewRepository,
  type InvitationRepository,
  type NotificationQueue,
  type SecretTokens,
  type UserDirectory,
  type CommentRepository,
  type ReactionRepository,
  type VideoEventPublisher,
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
  comments: CommentRepository
  reactions: ReactionRepository
  events: VideoEventPublisher
  invitations: InvitationRepository
  users: UserDirectory
  tokens: SecretTokens
  folders: FolderRepository
  notifications: NotificationQueue
  views: ViewRepository
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
    authorizeViewer: new AuthorizeViewer(adapters),
    getDiscussion: new GetDiscussion(adapters),
    addComment: new AddComment(adapters),
    editComment: new EditComment(adapters),
    deleteComment: new DeleteComment(adapters),
    addReaction: new AddReaction(adapters),
    listMembers: new ListMembers(adapters),
    inviteMember: new InviteMember(adapters),
    revokeInvitation: new RevokeInvitation(adapters),
    changeMemberRole: new ChangeMemberRole(adapters),
    removeMember: new RemoveMember(adapters),
    getInvitation: new GetInvitation(adapters),
    acceptInvitation: new AcceptInvitation(adapters),
    listFolders: new ListFolders(adapters),
    createFolder: new CreateFolder(adapters),
    renameFolder: new RenameFolder(adapters),
    deleteFolder: new DeleteFolder(adapters),
    moveVideo: new MoveVideo(adapters),
    trashVideo: new TrashVideo(adapters),
    restoreVideo: new RestoreVideo(adapters),
    startView: new StartView(adapters),
    recordViewProgress: new RecordViewProgress(adapters),
    getVideoStats: new GetVideoStats(adapters),
  }
}
