import { describe, expect, it } from 'vitest'
import { activeSegmentIndex, highlightParts, searchSegments } from './transcript'

const segments = [
  { startMs: 0, endMs: 2000, text: 'Hola a todos.' },
  { startMs: 2500, endMs: 5000, text: 'El camión llegó tarde.' },
  { startMs: 5000, endMs: 8000, text: 'CAMION, otra vez.' },
]

describe('transcript helpers', () => {
  it('finds the segment being spoken', () => {
    expect(activeSegmentIndex(segments, 0)).toBe(0)
    expect(activeSegmentIndex(segments, 1999)).toBe(0)
    expect(activeSegmentIndex(segments, 2200)).toBe(-1)
    expect(activeSegmentIndex(segments, 5000)).toBe(2)
    expect(activeSegmentIndex(segments, 9000)).toBe(-1)
    expect(activeSegmentIndex([], 10)).toBe(-1)
  })

  it('searches ignoring case and accents', () => {
    expect(searchSegments(segments, 'camion')).toEqual([1, 2])
    expect(searchSegments(segments, '  LLEGÓ ')).toEqual([1])
    expect(searchSegments(segments, '   ')).toEqual([])
  })

  it('splits text around every match, keeping the original characters', () => {
    expect(highlightParts('El camión y el Camion', 'camion')).toEqual([
      { text: 'El ', match: false },
      { text: 'camión', match: true },
      { text: ' y el ', match: false },
      { text: 'Camion', match: true },
    ])
    expect(highlightParts('Hola', '')).toEqual([{ text: 'Hola', match: false }])
    expect(highlightParts('Hola', 'xyz')).toEqual([{ text: 'Hola', match: false }])
    expect(highlightParts('ola', 'ola')).toEqual([{ text: 'ola', match: true }])
  })

  it('handles decomposed accents and Greek final sigma', () => {
    // "café" written as e + combining accent.
    expect(highlightParts('un cafe\u0301 solo', 'café')).toEqual([
      { text: 'un ', match: false },
      { text: 'café', match: true },
      { text: ' solo', match: false },
    ])
    expect(searchSegments([{ startMs: 0, endMs: 1, text: 'ΟΔΟΣ' }], 'οδος')).toEqual([0])
    expect(highlightParts('ΟΔΟΣ', 'οδος')).toEqual([{ text: 'ΟΔΟΣ', match: true }])
  })
})
