/** Emails Weft sends: new comments, replies and workspace invitations. */

export type Notification =
  /** Someone commented on the recipient's video. */
  | { kind: 'comment'; recipientId: string; videoId: string; commentId: string }
  /** Someone replied to the recipient's comment. */
  | { kind: 'reply'; recipientId: string; videoId: string; commentId: string }
  /** A signed-in person started watching the recipient's video. */
  | { kind: 'view'; recipientId: string; videoId: string; viewerId: string }
  /** The invite link is only known here: invitations store a hash of the token. */
  | { kind: 'invitation'; invitationId: string; token: string }

/** At most one email per person and video in this window, so busy threads don't flood inboxes. */
export const COMMENT_EMAIL_WINDOW_SECONDS = 10 * 60
/** At most one "they watched your video" email per viewer and video a day. */
export const VIEW_EMAIL_WINDOW_SECONDS = 24 * 60 * 60

export type EmailLocale = 'en' | 'es'

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

/** What a template needs to describe each kind of notification. */
export type NotificationContent =
  | {
      kind: 'comment' | 'reply'
      recipientName: string
      authorName: string
      videoTitle: string
      commentText: string
      /** Link to the video at the comment's moment. */
      url: string
    }
  | {
      kind: 'view'
      recipientName: string
      viewerName: string
      videoTitle: string
      url: string
    }
  | {
      kind: 'invitation'
      inviterName: string
      workspaceName: string
      role: string
      url: string
      expiresAt: Date
    }
