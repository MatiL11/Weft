import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  isLocale,
  localeFromHeaders,
  matchAcceptLanguage,
  readCookie,
  resolveLocale,
} from './locale'

describe('isLocale', () => {
  it.each([
    ['es', true],
    ['en', true],
    ['fr', false],
    ['ES', false],
    [undefined, false],
  ])('%j → %j', (value, expected) => {
    expect(isLocale(value)).toBe(expected)
  })
})

describe('matchAcceptLanguage', () => {
  it('picks the first supported language by quality', () => {
    expect(matchAcceptLanguage('fr-FR,fr;q=0.9,es-AR;q=0.8,en;q=0.7')).toBe('es')
  })

  it('respects explicit q ordering regardless of position', () => {
    expect(matchAcceptLanguage('en;q=0.5, es;q=0.9')).toBe('es')
  })

  it('matches regional variants to their base language', () => {
    expect(matchAcceptLanguage('es-419')).toBe('es')
    expect(matchAcceptLanguage('en-GB')).toBe('en')
  })

  it('ignores languages with q=0', () => {
    expect(matchAcceptLanguage('es;q=0, en;q=0.1')).toBe('en')
  })

  it.each([null, '', 'fr,de', '*'])('returns null for %j', (header) => {
    expect(matchAcceptLanguage(header)).toBeNull()
  })
})

describe('resolveLocale', () => {
  it('prefers an explicit cookie choice over the browser', () => {
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'es-AR' })).toBe('en')
  })

  it('falls back to the browser when the cookie is missing or invalid', () => {
    expect(resolveLocale({ cookie: 'xx', acceptLanguage: 'es-AR,es' })).toBe('es')
    expect(resolveLocale({ acceptLanguage: 'es' })).toBe('es')
  })

  it('falls back to the default locale', () => {
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE)
    expect(resolveLocale({ cookie: null, acceptLanguage: 'ja' })).toBe(DEFAULT_LOCALE)
  })
})

describe('readCookie', () => {
  it('reads a cookie value by name', () => {
    expect(readCookie('a=1; WEFT_LOCALE=es; b=2', 'WEFT_LOCALE')).toBe('es')
  })

  it('returns null when absent', () => {
    expect(readCookie('a=1', 'WEFT_LOCALE')).toBeNull()
    expect(readCookie(null, 'WEFT_LOCALE')).toBeNull()
  })
})

describe('localeFromHeaders', () => {
  it('uses the locale cookie, then Accept-Language', () => {
    expect(
      localeFromHeaders(new Headers({ cookie: 'WEFT_LOCALE=es', 'accept-language': 'en' })),
    ).toBe('es')
    expect(localeFromHeaders(new Headers({ 'accept-language': 'es-MX' }))).toBe('es')
    expect(localeFromHeaders(undefined)).toBe(DEFAULT_LOCALE)
  })
})
