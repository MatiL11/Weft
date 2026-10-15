'use client'

import { LOCALES, type Locale } from '@weft/i18n'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { setLocale } from '@/i18n/actions'

/** Segmented ES/EN control. Persists the choice in a cookie and re-renders the page. */
export function LocaleSwitcher() {
  const t = useTranslations('locale')
  const current = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSelect(locale: Locale) {
    if (locale === current) return
    startTransition(async () => {
      await setLocale(locale)
      router.refresh()
    })
  }

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="inline-flex rounded-lg border border-line bg-surface p-0.5 font-mono text-xs"
      aria-busy={isPending}
    >
      {LOCALES.map((locale) => {
        const isActive = locale === current
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            title={t(locale)}
            aria-pressed={isActive}
            disabled={isPending}
            onClick={() => handleSelect(locale)}
            className="h-7 cursor-pointer rounded-md px-2.5 text-muted uppercase transition-colors hover:text-fg aria-pressed:bg-fg aria-pressed:text-bg disabled:cursor-wait"
          >
            {locale}
          </button>
        )
      })}
    </div>
  )
}
