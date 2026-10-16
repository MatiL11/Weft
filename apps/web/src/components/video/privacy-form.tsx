'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { updateVideo, type VideoChanges } from '@/lib/video-api'
import { VIDEO_PRIVACIES, type VideoPrivacy } from '@/lib/video-summary'
import { OwnerCard } from './owner-card'

interface PrivacyFormProps {
  videoId: string
  privacy: VideoPrivacy
  hasPassword: boolean
}

const PASSWORD_MIN_LENGTH = 4

/** Who can watch: anyone with the link, the workspace, people with a password, or only me. */
export function PrivacyForm({ videoId, privacy, hasPassword }: PrivacyFormProps) {
  const t = useTranslations('video.owner.privacy')
  const router = useRouter()
  const [selected, setSelected] = useState(privacy)
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const keepsPassword = selected === 'password' && privacy === 'password' && hasPassword
  const needsPassword = selected === 'password' && !keepsPassword
  const isDirty = selected !== privacy || (selected === 'password' && password.length > 0)
  const passwordTooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH
  const canSave =
    isDirty && !passwordTooShort && (!needsPassword || password.length >= PASSWORD_MIN_LENGTH)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    const changes: VideoChanges = { privacy: selected }
    if (selected === 'password' && password) changes.password = password
    setStatus('saving')
    try {
      await updateVideo(videoId, changes)
      setPassword('')
      setStatus('saved')
      router.refresh()
    } catch {
      setStatus('error')
    }
  }

  return (
    <OwnerCard id="privacy-title" title={t('title')} description={t('description')}>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <fieldset className="grid gap-1.5">
          <legend className="sr-only">{t('title')}</legend>
          {VIDEO_PRIVACIES.map((option) => (
            <label
              key={option}
              className="group flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3.5 py-3 transition-colors hover:border-line-strong has-checked:border-fg has-checked:bg-surface-sunken"
            >
              <input
                type="radio"
                name="privacy"
                value={option}
                checked={selected === option}
                onChange={() => {
                  setSelected(option)
                  setStatus('idle')
                }}
                className="mt-1 accent-[var(--accent)]"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{t(`options.${option}.label`)}</span>
                <span className="text-xs text-muted">{t(`options.${option}.hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {selected === 'password' && (
          <div className="grid gap-1.5">
            <label htmlFor="privacy-password" className="text-sm font-medium">
              {keepsPassword ? t('newPassword') : t('password')}
            </label>
            <input
              id="privacy-password"
              type="password"
              autoComplete="new-password"
              value={password}
              placeholder={keepsPassword ? t('keepPassword') : undefined}
              onChange={(e) => {
                setPassword(e.currentTarget.value)
                setStatus('idle')
              }}
              aria-invalid={passwordTooShort}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm aria-invalid:border-danger"
            />
            <p className={`text-xs ${passwordTooShort ? 'text-danger' : 'text-muted'}`}>
              {t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSave || status === 'saving'}
            className="h-10 cursor-pointer rounded-xl bg-primary px-4 text-sm font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'saving' ? t('saving') : t('save')}
          </button>
          <p role="status" className="text-sm text-muted">
            {status === 'saved' && t('saved')}
            {status === 'error' && <span className="text-danger">{t('error')}</span>}
          </p>
        </div>
      </form>
    </OwnerCard>
  )
}
