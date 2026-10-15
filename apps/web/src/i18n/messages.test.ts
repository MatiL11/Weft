import { LOCALES } from '@weft/i18n'
import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import es from '../../messages/es.json'

const CATALOGS: Record<string, unknown> = { en, es }

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort()
}

function valueAt(catalog: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], catalog)
}

describe('message catalogs', () => {
  const reference = flattenKeys(en).sort()

  it('has a catalog for every supported locale', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...LOCALES].sort())
  })

  it.each(Object.keys(CATALOGS))('%s has exactly the same keys as en', (locale) => {
    expect(flattenKeys(CATALOGS[locale]).sort()).toEqual(reference)
  })

  it.each(Object.keys(CATALOGS))(
    '%s keeps the same placeholders and no empty strings',
    (locale) => {
      for (const key of reference) {
        const value = valueAt(CATALOGS[locale], key)
        expect(typeof value, key).toBe('string')
        expect((value as string).trim().length, key).toBeGreaterThan(0)
        expect(placeholders(value as string), key).toEqual(placeholders(valueAt(en, key) as string))
      }
    },
  )
})
