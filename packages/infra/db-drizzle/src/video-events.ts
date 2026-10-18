import {
  isReactionEmoji,
  type CommentRepository,
  type VideoEvent,
  type VideoEventPublisher,
} from '@weft/core'
import { z } from 'zod'
import type { DatabaseHandle } from './client'

const CHANNEL = 'weft_video_events'

/** What travels through NOTIFY: small references (payloads are capped at 8 KB). */
const Notice = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['comment.created', 'comment.updated']),
    videoId: z.string(),
    commentId: z.string(),
  }),
  z.object({ type: z.literal('comment.deleted'), videoId: z.string(), commentId: z.string() }),
  z.object({
    type: z.literal('reaction.created'),
    videoId: z.string(),
    reaction: z.object({
      id: z.string(),
      videoId: z.string(),
      userId: z.string().nullable(),
      emoji: z.string(),
      timestampMs: z.number(),
      createdAt: z.coerce.date(),
    }),
  }),
])
type Notice = z.infer<typeof Notice>

function toNotice(event: VideoEvent): Notice {
  switch (event.type) {
    case 'comment.created':
    case 'comment.updated':
      return { type: event.type, videoId: event.videoId, commentId: event.comment.id }
    case 'comment.deleted':
    case 'reaction.created':
      return event
  }
}

type Listener = (event: VideoEvent) => void

/**
 * Video events over PostgreSQL LISTEN/NOTIFY, so every API instance hears what any other one
 * published. Each instance holds one listening connection and fans events out to its
 * subscribers (e.g. open SSE streams).
 */
export class PostgresVideoEvents implements VideoEventPublisher {
  private readonly listeners = new Map<string, Set<Listener>>()
  private listening: Promise<{ unlisten(): Promise<void> }> | null = null
  /** Notices are handled one after another, so subscribers see them in order. */
  private dispatching: Promise<void> = Promise.resolve()

  constructor(
    private readonly database: Pick<DatabaseHandle, 'client'>,
    private readonly comments: CommentRepository,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}

  async publish(event: VideoEvent): Promise<void> {
    await this.database.client.notify(CHANNEL, JSON.stringify(toNotice(event)))
  }

  /** Calls `listener` for each event of the video until the returned function is called. */
  async subscribe(videoId: string, listener: Listener): Promise<() => void> {
    this.listening ??= this.database.client.listen(CHANNEL, (payload) => {
      this.dispatching = this.dispatching.then(() => this.dispatch(payload)).catch(this.onError)
    })
    await this.listening
    const set = this.listeners.get(videoId) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(videoId, set)
    return () => {
      set.delete(listener)
      if (set.size === 0) this.listeners.delete(videoId)
    }
  }

  async close(): Promise<void> {
    const listening = this.listening
    this.listening = null
    this.listeners.clear()
    if (listening) await (await listening).unlisten()
  }

  private async dispatch(payload: string): Promise<void> {
    const notice = Notice.parse(JSON.parse(payload))
    const listeners = this.listeners.get(notice.videoId)
    if (!listeners?.size) return
    const event = await this.resolve(notice)
    if (event) for (const listener of listeners) listener(event)
  }

  private async resolve(notice: Notice): Promise<VideoEvent | null> {
    switch (notice.type) {
      case 'comment.created':
      case 'comment.updated': {
        const comment = await this.comments.findById(notice.commentId)
        return comment ? { type: notice.type, videoId: notice.videoId, comment } : null
      }
      case 'comment.deleted':
        return notice
      case 'reaction.created': {
        const { emoji } = notice.reaction
        return isReactionEmoji(emoji)
          ? { ...notice, reaction: { ...notice.reaction, emoji } }
          : null
      }
    }
  }
}
