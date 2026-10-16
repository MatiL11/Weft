'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteVideo } from '@/lib/video-api'

/** Two-step delete: the first click asks, the second deletes. */
export function DeleteVideo({ videoId }: { videoId: string }) {
  const t = useTranslations('video.owner.delete')
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'confirm' | 'deleting' | 'error'>('idle')

  async function confirm() {
    setStep('deleting')
    try {
      await deleteVideo(videoId)
      router.push('/')
      router.refresh()
    } catch {
      setStep('error')
    }
  }

  if (step === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setStep('confirm')}
        className="h-9 w-fit cursor-pointer rounded-xl px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
      >
        {t('action')}
      </button>
    )
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="delete-question"
      className="grid gap-3 rounded-xl bg-danger-soft p-4"
    >
      <p id="delete-question" className="text-sm font-medium text-danger">
        {step === 'error' ? t('error') : t('question')}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={step === 'deleting'}
          autoFocus
          className="h-9 cursor-pointer rounded-xl bg-danger px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {step === 'deleting' ? t('deleting') : t('confirm')}
        </button>
        <button
          type="button"
          onClick={() => setStep('idle')}
          className="h-9 cursor-pointer rounded-xl px-3 text-sm font-medium transition-colors hover:bg-surface"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
