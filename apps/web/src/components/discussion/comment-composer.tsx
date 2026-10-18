'use client'

import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { formatClock } from '@/lib/player-timeline'

interface CommentComposerProps {
  /** Current playback position; comments can be pinned to it. */
  currentMs?: number
  initialBody?: string
  submitLabel: string
  onSubmit: (body: string, timestampMs: number | null) => Promise<void>
  onCancel?: () => void
  autoFocus?: boolean
}

const MAX_LENGTH = 2000

/** Text box for a new comment, a reply or an edit. Ctrl/⌘+Enter sends. */
export function CommentComposer({
  currentMs,
  initialBody = '',
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: CommentComposerProps) {
  const t = useTranslations('video.comments')
  const [body, setBody] = useState(initialBody)
  const [pinToTime, setPinToTime] = useState(true)
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle')
  const canPin = currentMs !== undefined

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!body.trim() || status === 'sending') return
    setStatus('sending')
    try {
      await onSubmit(body, canPin && pinToTime ? Math.round(currentMs) : null)
      setBody('')
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
          if (e.key === 'Escape') onCancel?.()
        }}
        maxLength={MAX_LENGTH}
        rows={2}
        autoFocus={autoFocus}
        aria-label={t('label')}
        placeholder={t('placeholder')}
        className="field-sizing-content max-h-40 min-h-16 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        {canPin && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={pinToTime}
              onChange={(e) => setPinToTime(e.currentTarget.checked)}
              className="accent-[var(--accent)]"
            />
            {t('at', { time: formatClock(currentMs / 1000) })}
          </label>
        )}
        <div className="ml-auto flex gap-1.5">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-8 cursor-pointer rounded-lg px-3 text-sm text-muted hover:text-fg"
            >
              {t('cancel')}
            </button>
          )}
          <button
            type="submit"
            disabled={!body.trim() || status === 'sending'}
            className="h-8 cursor-pointer rounded-lg bg-primary px-3 text-sm font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
      {status === 'error' && (
        <p role="alert" className="text-xs text-danger">
          {t('error')}
        </p>
      )}
    </form>
  )
}
