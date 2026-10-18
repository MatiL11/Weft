'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  /** Which load is the latest, and the events seen since it started. */
  const loads = useRef({ latest: 0, eventsSince: [] as DiscussionEvent[] })

  const apply = useCallback((event: DiscussionEvent) => {
    loads.current.eventsSince.push(event)
    setDiscussion((current) => (current ? applyEvent(current, event) : current))
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      const id = ++loads.current.latest
      loads.current.eventsSince = []
      return fetchDiscussion(videoId)
        .then((data) => {
          // An older load finishing late must not undo a newer one, and events that arrived
          // while this one was in flight are applied on top of it (applying twice is harmless).
          if (cancelled || id !== loads.current.latest) return
          setDiscussion(loads.current.eventsSince.reduce(applyEvent, data))
        })
        .catch(() => {})
    }

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
