'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { restoreVideo } from '@/lib/video-api'

/** Shown to the owner on a video in the trash: its link doesn't work for anyone else. */
export function TrashedBanner({ videoId }: { videoId: string }) {
  const t = useTranslations('video.trashed')
  const router = useRouter()
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      <span className="font-medium">{t('title')}</span>
      <span className="opacity-80">{t('body')}</span>
      <button
        type="button"
        onClick={() => void restoreVideo(videoId).then(() => router.refresh())}
        className="ml-auto h-8 cursor-pointer rounded-lg border border-current/30 px-3 font-medium hover:bg-current/10"
      >
        {t('restore')}
      </button>
    </div>
  )
}
