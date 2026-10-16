'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { updateVideo } from '@/lib/video-api'

const TITLE_MAX_LENGTH = 120

/** The video title as an inline-editable heading (owner only). */
export function TitleEditor({ videoId, title }: { videoId: string; title: string }) {
  const t = useTranslations('video.owner')
  const [value, setValue] = useState(title)
  const [saved, setSaved] = useState(title)
  const [hasError, setHasError] = useState(false)

  async function save() {
    const next = value.trim()
    if (next === saved) return setValue(saved)
    if (next.length === 0) return setValue(saved)
    try {
      await updateVideo(videoId, { title: next })
      setSaved(next)
      setValue(next)
      setHasError(false)
    } catch {
      setHasError(true)
    }
  }

  return (
    <div className="grid gap-1">
      <label htmlFor="video-title" className="sr-only">
        {t('titleLabel')}
      </label>
      <input
        id="video-title"
        value={value}
        maxLength={TITLE_MAX_LENGTH}
        onChange={(e) => setValue(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setValue(saved)
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
          }
        }}
        className="-mx-2 w-[calc(100%+1rem)] rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-2xl font-semibold tracking-tight transition-colors hover:border-line focus:border-line-strong focus:bg-surface focus:outline-none sm:text-3xl"
      />
      {hasError && (
        <p role="alert" className="text-sm text-danger">
          {t('saveFailed')}
        </p>
      )}
    </div>
  )
}
