'use client'

import { useEffect, useState } from 'react'
import type { TranscriptView } from '@/lib/transcript'
import { fetchTranscript } from '@/lib/video-api'

/** Loads the transcript the API advertised for a video; null until loaded or if absent. */
export function useTranscript(url: string | null | undefined): TranscriptView | null {
  const [transcript, setTranscript] = useState<{ url: string; data: TranscriptView } | null>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    // Captions are an extra: if they fail to load, the video still plays without them.
    fetchTranscript(url)
      .then((data) => !cancelled && setTranscript({ url, data }))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [url])

  return transcript && transcript.url === url ? transcript.data : null
}
