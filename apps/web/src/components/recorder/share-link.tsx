'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

interface ShareLinkProps {
  url: string
  hint?: string
}

/** Read-only share URL with a copy button (falls back to selecting the text). */
export function ShareLink({ url, hint }: ShareLinkProps) {
  const t = useTranslations('recorder.share')
  const [isCopied, setIsCopied] = useState(false)

  async function handleCopy(input: HTMLInputElement | null) {
    try {
      await navigator.clipboard.writeText(url)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      input?.select()
    }
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor="share-link" className="text-sm font-medium">
        {t('label')}
      </label>
      <div className="flex gap-2">
        <input
          id="share-link"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-sunken px-3 font-mono text-sm text-fg"
        />
        <button
          type="button"
          onClick={(e) =>
            void handleCopy(e.currentTarget.previousElementSibling as HTMLInputElement)
          }
          className="h-10 shrink-0 cursor-pointer rounded-xl bg-primary px-4 text-sm font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98]"
          aria-live="polite"
        >
          {isCopied ? t('copied') : t('copy')}
        </button>
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}
