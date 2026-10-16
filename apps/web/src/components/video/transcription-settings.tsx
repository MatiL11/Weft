'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { fetchVideo, requestTranscription, updateVideo } from '@/lib/video-api'
import {
  TRANSCRIPT_LANGUAGES,
  type TranscriptionState,
  type TranscriptLanguage,
} from '@/lib/video-summary'
import { OwnerCard } from './owner-card'
import { languageName } from './transcript-panel'

interface TranscriptionSettingsProps {
  videoId: string
  state: TranscriptionState
  language: TranscriptLanguage
}

const POLL_INTERVAL_MS = 4000
const IN_PROGRESS: ReadonlySet<TranscriptionState> = new Set(['queued', 'processing'])

/** Spoken language and transcription progress, for the owner. */
export function TranscriptionSettings({ videoId, state, language }: TranscriptionSettingsProps) {
  const t = useTranslations('video.owner.transcription')
  const locale = useLocale()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!IN_PROGRESS.has(state)) return
    const timer = setInterval(() => {
      void fetchVideo(videoId)
        .then((video) => {
          if (video.owner && video.owner.transcriptionState !== state) router.refresh()
        })
        .catch(() => {})
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [videoId, state, router])

  async function run(action: () => Promise<unknown>) {
    setIsSaving(true)
    setHasError(false)
    try {
      await action()
      router.refresh()
    } catch {
      setHasError(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <OwnerCard
      id="transcription-title"
      title={t('title')}
      description={t('description')}
      aside={
        <span
          role="status"
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ${
            state === 'failed' ? 'bg-danger-soft text-danger' : 'bg-surface-sunken text-muted'
          }`}
        >
          {IN_PROGRESS.has(state) && (
            <span className="pulse-dot size-1.5 rounded-full bg-accent" aria-hidden="true" />
          )}
          {t(`states.${state}`)}
        </span>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-48 flex-1 gap-1.5">
          <label htmlFor="transcript-language" className="text-sm font-medium">
            {t('language')}
          </label>
          <select
            id="transcript-language"
            value={language}
            disabled={isSaving}
            onChange={(e) => {
              const transcriptLanguage = e.currentTarget.value as TranscriptLanguage
              void run(() => updateVideo(videoId, { transcriptLanguage }))
            }}
            className="h-10 cursor-pointer rounded-xl border border-line bg-surface px-3 text-sm"
          >
            {TRANSCRIPT_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {code === 'auto' ? t('auto') : languageName(code, locale)}
              </option>
            ))}
          </select>
        </div>
        {(state === 'failed' || state === 'none' || state === 'ready') && (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void run(() => requestTranscription(videoId))}
            className="h-10 cursor-pointer rounded-xl border border-line px-4 text-sm font-medium transition-colors hover:border-line-strong disabled:opacity-50"
          >
            {state === 'ready' ? t('again') : state === 'none' ? t('start') : t('retry')}
          </button>
        )}
      </div>
      {hasError && (
        <p role="alert" className="text-sm text-danger">
          {t('error')}
        </p>
      )}
    </OwnerCard>
  )
}
