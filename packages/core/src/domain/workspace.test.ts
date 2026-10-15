import { describe, expect, it } from 'vitest'
import { DomainError } from './errors'
import { createWorkspace, isValidSlug, slugify } from './workspace'

const NOW = new Date('2026-10-15T12:00:00Z')

describe('slugify', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(slugify('Acme Video Team')).toBe('acme-video-team')
  })

  it('strips accents and symbols', () => {
    expect(slugify('  Diseño & Producción!! ')).toBe('diseno-produccion')
  })

  it('collapses repeated separators', () => {
    expect(slugify('a -- b __ c')).toBe('a-b-c')
  })

  it('truncates to 48 characters without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(47)} bcd`)
    expect(slug.length).toBeLessThanOrEqual(48)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('falls back to "workspace" when nothing usable remains', () => {
    expect(slugify('🎥🎥')).toBe('workspace')
  })
})

describe('isValidSlug', () => {
  it.each(['acme', 'acme-2', 'a1-b2'])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true)
  })

  it.each(['', 'Acme', '-acme', 'acme-', 'a--b', 'a b', 'x'.repeat(49)])('rejects %j', (slug) => {
    expect(isValidSlug(slug)).toBe(false)
  })
})

describe('createWorkspace', () => {
  it('creates a workspace with a trimmed name', () => {
    const ws = createWorkspace({ id: 'ws_1', name: '  Acme  ', slug: 'acme', now: NOW })
    expect(ws).toEqual({ id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW })
  })

  it('rejects an empty name', () => {
    expect(() => createWorkspace({ id: 'ws_1', name: '   ', slug: 'acme', now: NOW })).toThrow(
      DomainError,
    )
  })

  it('rejects a name longer than 64 characters', () => {
    expect(() =>
      createWorkspace({ id: 'ws_1', name: 'x'.repeat(65), slug: 'acme', now: NOW }),
    ).toThrowError(expect.objectContaining({ code: 'workspace.name_invalid' }))
  })

  it('rejects an invalid slug', () => {
    expect(() =>
      createWorkspace({ id: 'ws_1', name: 'Acme', slug: 'Bad Slug', now: NOW }),
    ).toThrowError(expect.objectContaining({ code: 'workspace.slug_invalid' }))
  })
})
