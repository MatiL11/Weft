import { describe, expect, it } from 'vitest'
import { findMatchingSegment, foldForSearch, normalizeFolderName } from './library'

describe('library', () => {
  it('normalizes folder names', () => {
    expect(normalizeFolderName('  Q4   demos ')).toBe('Q4 demos')
    expect(() => normalizeFolderName(' ')).toThrowError(
      expect.objectContaining({ code: 'folder.name_invalid' }),
    )
    expect(() => normalizeFolderName('x'.repeat(81))).toThrow()
  })

  it('finds where a transcript mentions the query, ignoring case and accents', () => {
    const segments = [
      { startMs: 0, endMs: 1000, text: 'Hola equipo.' },
      { startMs: 1000, endMs: 3000, text: 'Revisemos la Migración de datos.' },
    ]
    expect(findMatchingSegment(segments, 'migracion')).toEqual(segments[1])
    expect(findMatchingSegment(segments, 'nada')).toBeNull()
    expect(findMatchingSegment(segments, '  ')).toBeNull()
    expect(foldForSearch('ΟΔΟΣ Árbol')).toBe('οδοσ arbol')
  })
})
