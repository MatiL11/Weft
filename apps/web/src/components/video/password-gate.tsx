'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { unlockVideo, VideoApiError } from '@/lib/video-api'

type GateError = 'incorrect' | 'tooMany' | 'generic'

const errorFor = (error: unknown): GateError => {
  if (!(error instanceof VideoApiError)) return 'generic'
  if (error.code === 'video.password_incorrect') return 'incorrect'
  return error.code === 'video.too_many_attempts' ? 'tooMany' : 'generic'
}

/** Asks for a protected video's password; the API remembers it with a cookie. */
export function PasswordGate({ videoId }: { videoId: string }) {
  const t = useTranslations('video.password')
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<GateError | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      await unlockVideo(videoId, password)
      router.refresh()
    } catch (caught) {
      setError(errorFor(caught))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid aspect-video w-full place-items-center rounded-2xl border border-line bg-surface-sunken p-6">
      <form onSubmit={handleSubmit} className="rise grid w-full max-w-sm gap-4">
        <div className="grid justify-items-start gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden="true"
            >
              <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
              <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
            </svg>
          </span>
          <div className="grid gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-sm text-muted">{t('body')}</p>
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="video-password" className="text-sm font-medium">
            {t('label')}
          </label>
          <input
            id="video-password"
            type="password"
            autoComplete="off"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            aria-invalid={error === 'incorrect'}
            aria-describedby={error ? 'video-password-error' : undefined}
            className="h-11 rounded-xl border border-line bg-surface px-3 aria-invalid:border-danger"
          />
          {error && (
            <p id="video-password-error" role="alert" className="text-sm font-medium text-danger">
              {t(`errors.${error}`)}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isSubmitting || password.length === 0}
          className="h-11 cursor-pointer rounded-xl bg-primary font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? t('checking') : t('submit')}
        </button>
      </form>
    </div>
  )
}
