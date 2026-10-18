import { toVisibleMs } from '../domain/collaboration'
import { invitationStatus } from '../domain/membership'
import {
  COMMENT_EMAIL_WINDOW_SECONDS,
  type Notification,
  type NotificationContent,
} from '../domain/notification'
import type { CommentWithAuthor } from '../domain/collaboration'
import { accessFor } from '../domain/video'
import type {
  Clock,
  CommentRepository,
  EmailTemplates,
  InvitationRepository,
  Mailer,
  NotificationQueue,
  SecretTokens,
  UserDirectory,
  UserProfile,
  VideoRepository,
  WorkspaceRepository,
} from '../ports'

/** Queues emails about a new comment: to the video's owner, or to the comment being answered. */
export async function notifyAboutComment(
  deps: { notifications: NotificationQueue; comments: CommentRepository },
  comment: CommentWithAuthor,
  videoOwnerId: string,
): Promise<void> {
  let recipientId = videoOwnerId
  let kind: 'comment' | 'reply' = 'comment'
  if (comment.parentId) {
    const parent = await deps.comments.findById(comment.parentId)
    if (!parent) return
    recipientId = parent.authorId
    kind = 'reply'
  }
  if (recipientId === comment.authorId) return
  const notification = { kind, recipientId, videoId: comment.videoId, commentId: comment.id }
  try {
    await deps.notifications.notify(notification, {
      dedupeKey: `${kind}:${recipientId}:${comment.videoId}`,
      dedupeSeconds: COMMENT_EMAIL_WINDOW_SECONDS,
    })
  } catch {
    // Emails are a courtesy: a queue outage must not fail the comment itself.
  }
}

export interface DeliveryDeps {
  videos: VideoRepository
  comments: CommentRepository
  users: UserDirectory
  workspaces: WorkspaceRepository
  invitations: InvitationRepository
  tokens: SecretTokens
  templates: EmailTemplates
  mailer: Mailer
  clock: Clock
  /** Public base URL of the web app, for links in emails. */
  publicUrl: string
}

export type DeliveryResult = 'sent' | 'skipped'

/**
 * Background job: sends one notification email, unless it no longer makes sense (the comment
 * was deleted, the recipient can't see the video any more, the invitation was used…).
 */
export class DeliverNotification {
  constructor(private readonly deps: DeliveryDeps) {}

  async execute(notification: Notification): Promise<DeliveryResult> {
    const prepared =
      notification.kind === 'invitation'
        ? await this.invitation(notification.invitationId, notification.token)
        : await this.comment(
            notification.recipientId,
            notification.videoId,
            notification.commentId,
            notification.kind,
          )
    if (!prepared) return 'skipped'
    const { recipient, content } = prepared
    const message = this.deps.templates.render(content, recipient.locale ?? 'en')
    await this.deps.mailer.send({ to: recipient.email, ...message })
    return 'sent'
  }

  private link(path: string) {
    return `${this.deps.publicUrl.replace(/\/$/, '')}${path}`
  }

  private async comment(
    recipientId: string,
    videoId: string,
    commentId: string,
    kind: 'comment' | 'reply',
  ): Promise<{ recipient: UserProfile; content: NotificationContent } | null> {
    const [recipient, video, comment] = await Promise.all([
      this.deps.users.findById(recipientId),
      this.deps.videos.findById(videoId),
      this.deps.comments.findById(commentId),
    ])
    if (!recipient || !video || !comment || comment.deletedAt) return null
    const role = await this.deps.workspaces.roleOf(video.workspaceId, recipient.id)
    // Password-protected videos still email their owner and members; the link asks for it.
    const access = accessFor(video, { userId: recipient.id, role, unlocked: true })
    if (access !== 'granted') return null
    const at = comment.timestampMs === null ? null : toVisibleMs(video, comment.timestampMs)
    return {
      recipient,
      content: {
        kind,
        recipientName: recipient.name,
        authorName: comment.author.name,
        videoTitle: video.title,
        commentText: comment.body,
        url: this.link(`/v/${video.id}${at === null ? '' : `?t=${Math.floor(at / 1000)}`}`),
      },
    }
  }

  private async invitation(
    invitationId: string,
    token: string,
  ): Promise<{ recipient: UserProfile; content: NotificationContent } | null> {
    const invitation = await this.deps.invitations.findById(invitationId)
    if (!invitation || invitationStatus(invitation, this.deps.clock.now()) !== 'pending')
      return null
    // The token must be the invitation's own: a forged job can't mail arbitrary links.
    if (this.deps.tokens.hash(token) !== invitation.tokenHash) return null
    const [workspace, inviter, existing] = await Promise.all([
      this.deps.workspaces.findById(invitation.workspaceId),
      this.deps.users.findById(invitation.invitedBy),
      this.deps.users.findByEmail(invitation.email),
    ])
    if (!workspace) return null
    return {
      recipient: {
        id: existing?.id ?? '',
        name: existing?.name ?? '',
        email: invitation.email,
        // Strangers get the inviter's language.
        locale: existing?.locale ?? inviter?.locale,
      },
      content: {
        kind: 'invitation',
        inviterName: inviter?.name ?? '',
        workspaceName: workspace.name,
        role: invitation.role,
        url: this.link(`/invite/${token}`),
        expiresAt: invitation.expiresAt,
      },
    }
  }
}
