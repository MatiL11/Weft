'use client'

import { SEGMENT_SECONDS, type RecordingManifest } from '@weft/recorder'
import { useFormatter, useTranslations } from 'next-intl'
import { formatDuration } from '@/lib/recording-format'

interface RecoveryBannerProps {
  recording: RecordingManifest
  onDownload: () => void
  onDiscard: () => void
}

/** Offers an interrupted recording (tab closed, crash) found in local storage. */
export function RecoveryBanner({ recording, onDownload, onDiscard }: RecoveryBannerProps) {
  const t = useTranslations('recorder.recovery')
  const format = useFormatter()
  // Interrupted recordings never stored their final length; segments are ~SEGMENT_SECONDS each.
  const approxMs = recording.segmentCount * SEGMENT_SECONDS * 1000

  return (
    <div
      role="region"
      aria-label={t('title')}
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        <div className="grid gap-0.5">
          <p className="font-medium">{t('title')}</p>
          <p className="text-sm text-muted">
            {t('body', {
              date: format.dateTime(new Date(recording.createdAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
              duration: formatDuration(approxMs),
            })}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-sunken hover:text-fg"
        >
          {t('discard')}
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="h-9 cursor-pointer rounded-lg border border-line px-3 text-sm font-medium hover:border-line-strong"
        >
          {t('download')}
        </button>
      </div>
    </div>
  )
}
