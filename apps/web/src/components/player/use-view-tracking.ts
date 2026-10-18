'use client'

import { useCallback, useEffect, useRef } from 'react'
import { sendViewProgress, startView } from '@/lib/video-api'
import { ViewTracker } from '@/lib/view-tracking'

const REPORT_INTERVAL_MS = 15_000

/**
 * Counts a view once the viewer has watched a second, then reports which parts they watched
 * every 15 s and when they leave. Returns the callback to feed with player positions.
 */
export function useViewTracking(videoId: string, enabled: boolean) {
  const tracker = useRef(new ViewTracker())
  const view = useRef<{ id: string | null; starting: boolean; reported: string }>({
    id: null,
    starting: false,
    reported: '',
  })

  const flush = useCallback(
    (beacon: boolean) => {
      const { id, reported } = view.current
      if (!id) return
      const snapshot = tracker.current.snapshot
      const key = `${snapshot.buckets}:${snapshot.watchedMs}`
      if (key === reported) return
      view.current.reported = key
      void sendViewProgress(videoId, id, snapshot, beacon).catch(() => {})
    },
    [videoId],
  )

  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => flush(false), REPORT_INTERVAL_MS)
    const leave = () => flush(true)
    const hidden = () => document.visibilityState === 'hidden' && flush(true)
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', hidden)
      flush(true)
    }
  }, [enabled, flush])

  return useCallback(
    (time: number, info: { duration: number; playing: boolean }) => {
      if (!enabled) return
      tracker.current.tick(time, info.duration, info.playing)
      const current = view.current
      if (!current.id && !current.starting && tracker.current.countsAsView) {
        current.starting = true
        startView(videoId)
          .then((id) => {
            current.id = id
            flush(false)
          })
          .catch(() => {
            // Couldn't start (offline, rate limited): try again on a later tick.
            current.starting = false
          })
      }
      if (!info.playing) flush(false)
    },
    [enabled, videoId, flush],
  )
}
