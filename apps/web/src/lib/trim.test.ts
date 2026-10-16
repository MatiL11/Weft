import { describe, expect, it } from 'vitest'
import { constrainTrim, formatPrecise, trimToSave } from './trim'

describe('trim editing', () => {
  it('keeps the start inside the recording and before the end', () => {
    expect(constrainTrim({ startMs: -50, endMs: 5000 }, 6000, 'start')).toEqual({
      startMs: 0,
      endMs: 5000,
    })
    expect(constrainTrim({ startMs: 4800, endMs: 5000 }, 6000, 'start')).toEqual({
      startMs: 4000,
      endMs: 5000,
    })
  })

  it('keeps the end inside the recording and after the start', () => {
    expect(constrainTrim({ startMs: 1000, endMs: 9000 }, 6000, 'end')).toEqual({
      startMs: 1000,
      endMs: 6000,
    })
    expect(constrainTrim({ startMs: 1000, endMs: 1200 }, 6000, 'end')).toEqual({
      startMs: 1000,
      endMs: 2000,
    })
    expect(constrainTrim({ startMs: 5500, endMs: 5600 }, 6000, 'end')).toEqual({
      startMs: 5500,
      endMs: 6000,
    })
  })

  it('sends no trim when everything is kept', () => {
    expect(trimToSave({ startMs: 0, endMs: 6000 }, 6000)).toBeNull()
    expect(trimToSave({ startMs: 0, endMs: 5000 }, 6000)).toEqual({ startMs: 0, endMs: 5000 })
  })

  it('formats times to a tenth of a second', () => {
    expect(formatPrecise(0)).toBe('0:00.0')
    expect(formatPrecise(3260)).toBe('0:03.3')
    expect(formatPrecise(76_840)).toBe('1:16.8')
  })
})
