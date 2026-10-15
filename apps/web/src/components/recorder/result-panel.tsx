'use client'

import { useTranslations } from 'next-intl'
import { formatDuration } from '@/lib/recording-format'

export interface FinishedVideo {
  url: string
  filename: string
  durationMs: number
  hitLimit: boolean
}

interface ResultPanelProps {
  video: FinishedVideo
  onRecordAgain: () => void
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
          <p className="text-muted">{t('subtitle')}</p>
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
            className="flex h-11 items-center rounded-xl bg-primary px-5 font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98]"
          >
            {t('download')}
          </a>
        </div>
      </div>
    </div>
  )
}
