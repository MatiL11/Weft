export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'
/** Cookie that stores the user's explicit language choice. */
export const LOCALE_COOKIE = 'WEFT_LOCALE'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

interface WeightedLanguage {
  base: string
  quality: number
}

function parseAcceptLanguage(header: string): WeightedLanguage[] {
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';')
      const qParam = params.find((p) => p.trim().startsWith('q='))
      const quality = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1
      return {
        base: tag.trim().toLowerCase().split('-')[0] ?? '',
        quality: Number.isNaN(quality) ? 0 : quality,
      }
    })
    .filter((lang) => lang.base.length > 0 && lang.quality > 0)
    .sort((a, b) => b.quality - a.quality)
}

/** Returns the best supported locale from an Accept-Language header, or null. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null
  const match = parseAcceptLanguage(header).find((lang) => isLocale(lang.base))
  return match ? (match.base as Locale) : null
}

export interface LocaleSources {
  cookie?: string | null | undefined
  acceptLanguage?: string | null | undefined
}

/** Explicit choice (cookie) wins, then the browser's languages, then the default. */
export function resolveLocale(sources: LocaleSources): Locale {
  if (isLocale(sources.cookie)) return sources.cookie
  return matchAcceptLanguage(sources.acceptLanguage) ?? DEFAULT_LOCALE
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

/** Minimal read-only view of request headers (satisfied by the Fetch API `Headers`). */
export interface HeaderReader {
  get(name: string): string | null
}

export function localeFromHeaders(headers: HeaderReader | undefined): Locale {
  return resolveLocale({
    cookie: readCookie(headers?.get('cookie'), LOCALE_COOKIE),
    acceptLanguage: headers?.get('accept-language'),
  })
}
