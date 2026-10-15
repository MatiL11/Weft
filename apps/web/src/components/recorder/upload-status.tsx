'use client'

import type { UploadQueue } from '@weft/recorder/core'
import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

/** Compact upload progress for the recording controls. */
export function UploadStatus({ queue }: { queue: UploadQueue }) {
  const t = useTranslations('recorder.upload')
  const s = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot)
  const total = s.uploaded + s.pending + s.failed

  if (s.failed > 0) {
    return (
      <span className="text-sm font-medium text-danger">{t('failed', { count: s.failed })}</span>
    )
  }
  if (s.pending > 0) {
    return (
      <span className="text-sm text-muted tabular-nums" role="status">
        {t('uploading', { done: s.uploaded, total })}
      </span>
    )
  }
  return total > 0 ? (
    <span className="flex items-center gap-1.5 text-sm text-muted" role="status">
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      {t('synced')}
    </span>
  ) : null
}
