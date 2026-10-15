'use client'

import { useTranslations } from 'next-intl'
import { formatDuration } from '@/lib/recording-format'
import { ShareLink } from './share-link'

export type ShareStatus = 'uploading' | 'ready' | 'failed'

export interface FinishedVideo {
  url: string
  filename: string
  durationMs: number
  hitLimit: boolean
  /** Null when the recording never reached the server. */
  share: { url: string; status: ShareStatus } | null
}

interface ResultPanelProps {
  video: FinishedVideo
  onRecordAgain: () => void
}

function ShareSection({ share }: { share: NonNullable<FinishedVideo['share']> }) {
  const t = useTranslations('recorder')

  if (share.status === 'failed') {
    return (
      <p
        role="alert"
        className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
      >
        {t('result.uploadFailed')}
      </p>
    )
  }
  if (share.status === 'uploading') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <span className="pulse-dot size-2 rounded-full bg-accent" aria-hidden="true" />
        {t('session.finishing')}
      </p>
    )
  }
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface p-5">
      <div className="grid gap-0.5">
        <h2 className="font-semibold">{t('result.shareTitle')}</h2>
        <p className="text-sm text-muted">{t('result.shareSubtitle')}</p>
      </div>
      <ShareLink url={share.url} />
      <a
        href={share.url}
        target="_blank"
        rel="noopener noreferrer"
        className="w-fit text-sm font-medium text-fg underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
      >
        {t('result.openLink')} ↗
      </a>
    </div>
  )
}

export function ResultPanel({ video, onRecordAgain }: ResultPanelProps) {
  const t = useTranslations('recorder.result')

  return (
    <div className="rise mx-auto grid w-full max-w-4xl gap-6">
      <video
        src={video.url}
        controls
        playsInline
        className="aspect-video w-full rounded-2xl border border-line bg-[#111014]"
      />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="grid max-w-xl gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          {!video.share && <p className="text-muted">{t('localOnly')}</p>}
          <p className="font-mono text-sm text-muted">
            {t('duration', { time: formatDuration(video.durationMs) })}
          </p>
          {video.hitLimit && (
            <p className="text-sm text-muted">
              {t('limitReached', { time: formatDuration(video.durationMs) })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRecordAgain}
            className="h-11 cursor-pointer rounded-xl border border-line px-5 font-medium transition-colors hover:border-line-strong"
          >
            {t('again')}
          </button>
          <a
            href={video.url}
            download={video.filename}
            className="flex h-11 items-center rounded-xl border border-line px-5 font-medium transition-colors hover:border-line-strong"
          >
            {t('download')}
          </a>
        </div>
      </div>
      {video.share && <ShareSection share={video.share} />}
    </div>
  )
}
