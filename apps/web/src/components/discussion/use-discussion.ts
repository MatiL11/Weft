'use client'

import { useCallback, useEffect, useState } from 'react'
import { applyEvent, type Discussion, type DiscussionEvent } from '@/lib/discussion'
import { fetchDiscussion } from '@/lib/video-api'

const EVENT_TYPES = [
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'reaction.created',
] as const

export interface LiveDiscussion {
  discussion: Discussion | null
  /** Applies a change made here right away, before its live echo arrives. */
  apply(event: DiscussionEvent): void
  /** Reactions that just arrived live, for a brief on-screen burst. */
  incoming: { id: string; emoji: string }[]
}

/** A video's comments and reactions, kept up to date over server-sent events. */
export function useDiscussion(videoId: string): LiveDiscussion {
  const [discussion, setDiscussion] = useState<Discussion | null>(null)
  const [incoming, setIncoming] = useState<{ id: string; emoji: string }[]>([])

  const apply = useCallback((event: DiscussionEvent) => {
    setDiscussion((current) => (current ? applyEvent(current, event) : current))
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetchDiscussion(videoId)
        .then((data) => !cancelled && setDiscussion(data))
        .catch(() => {})

    const source = new EventSource(`/api/videos/${encodeURIComponent(videoId)}/events`)
    // 'ready' also fires after a reconnect: reload to catch up on anything missed meanwhile.
    source.addEventListener('ready', () => void load())
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (message) => {
        const data = JSON.parse((message as MessageEvent<string>).data)
        if (type === 'comment.deleted') return apply({ type, commentId: data.commentId })
        if (type === 'reaction.created') {
          apply({ type, reaction: data })
          setIncoming((list) => [...list.slice(-12), { id: data.id, emoji: data.emoji }])
          return
        }
        apply({ type, comment: data })
      })
    }
    void load()
    return () => {
      cancelled = true
      source.close()
    }
  }, [videoId, apply])

  return { discussion, apply, incoming }
}
