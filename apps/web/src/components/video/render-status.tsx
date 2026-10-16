'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { fetchVideo, requestRender } from '@/lib/video-api'
import type { RenderState } from '@/lib/video-summary'

const POLL_INTERVAL_MS = 4000
const IN_PROGRESS: ReadonlySet<RenderState> = new Set(['queued', 'processing'])

/** Processing state for the owner; refreshes the page when a render finishes. */
export function RenderStatus({ videoId, state }: { videoId: string; state: RenderState }) {
  const t = useTranslations('video.owner.render')
  const router = useRouter()
  const [isRetrying, setIsRetrying] = useState(false)

  useEffect(() => {
    if (!IN_PROGRESS.has(state)) return
    const timer = setInterval(() => {
      void fetchVideo(videoId)
        .then((video) => {
          if (video.owner && video.owner.renderState !== state) router.refresh()
        })
        .catch(() => {})
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [videoId, state, router])

  async function retry() {
    setIsRetrying(true)
    try {
      await requestRender(videoId)
      router.refresh()
    } finally {
      setIsRetrying(false)
    }
  }

  const tone = {
    none: 'bg-surface-sunken text-muted',
    queued: 'bg-accent-soft text-accent',
    processing: 'bg-accent-soft text-accent',
    ready: 'bg-surface-sunken text-muted',
    failed: 'bg-danger-soft text-danger',
  }[state]

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-sm ${tone}`}
    >
      {IN_PROGRESS.has(state) && (
        <span className="pulse-dot size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      )}
      <span className="font-medium">{t(`${state}.title`)}</span>
      <span className="opacity-80">{t(`${state}.body`)}</span>
      {(state === 'failed' || state === 'none') && (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={isRetrying}
          className="ml-auto h-8 cursor-pointer rounded-lg border border-current/25 px-3 font-medium transition-colors hover:bg-current/10 disabled:opacity-50"
        >
          {state === 'failed' ? t('retry') : t('process')}
        </button>
      )}
    </div>
  )
}
