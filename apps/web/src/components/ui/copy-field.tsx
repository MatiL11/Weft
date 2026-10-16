'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

interface CopyFieldProps {
  id: string
  label: string
  value: string
  hint?: string
  /** Shows long values (e.g. embed code) in a few lines instead of one. */
  multiline?: boolean
  /** Button text; defaults to "Copy link". */
  copyLabel?: string
}

const COPIED_FEEDBACK_MS = 2000

/** Read-only value with a copy button (falls back to selecting the text). */
export function CopyField({
  id,
  label,
  value,
  hint,
  multiline = false,
  copyLabel,
}: CopyFieldProps) {
  const t = useTranslations('recorder.share')
  const [isCopied, setIsCopied] = useState(false)
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS)
    } catch {
      fieldRef.current?.select()
    }
  }

  const fieldClass =
    'min-w-0 flex-1 rounded-xl border border-line bg-surface-sunken px-3 font-mono text-sm text-fg'

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className={`flex gap-2 ${multiline ? 'items-start' : ''}`}>
        {multiline ? (
          <textarea
            id={id}
            ref={fieldRef}
            readOnly
            rows={3}
            value={value}
            onFocus={(e) => e.currentTarget.select()}
            className={`${fieldClass} resize-none py-2 leading-relaxed`}
          />
        ) : (
          <input
            id={id}
            ref={fieldRef}
            readOnly
            value={value}
            onFocus={(e) => e.currentTarget.select()}
            className={`${fieldClass} h-10`}
          />
        )}
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="h-10 shrink-0 cursor-pointer rounded-xl bg-primary px-4 text-sm font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98]"
          aria-live="polite"
        >
          {isCopied ? t('copied') : (copyLabel ?? t('copy'))}
        </button>
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}
