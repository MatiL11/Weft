'use server'

import { isLocale, LOCALE_COOKIE } from '@weft/i18n'
import { cookies } from 'next/headers'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/** Persists the user's language choice. Rejects anything that is not a supported locale. */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) throw new Error(`Unsupported locale: ${locale}`)
  ;(await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  })
}
