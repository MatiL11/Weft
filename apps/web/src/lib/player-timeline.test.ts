import { describe, expect, it } from 'vitest'
import {
  formatClock,
  parseStartTime,
  spriteTile,
  toMediaTime,
  toVisibleTime,
  visibleWindow,
} from './player-timeline'

describe('player timeline', () => {
  it('shows the whole media without a trim', () => {
    expect(visibleWindow(null, 12.5)).toEqual({ start: 0, end: 12.5 })
    expect(visibleWindow(null, Number.NaN)).toEqual({ start: 0, end: 0 })
  })

  it('maps between media time and the trimmed, visible timeline', () => {
    const window = visibleWindow({ startMs: 2000, endMs: 8000 }, 10)
    expect(window).toEqual({ start: 2, end: 8 })
    expect(toVisibleTime(5, window)).toBe(3)
    expect(toVisibleTime(1, window)).toBe(0)
    expect(toVisibleTime(9, window)).toBe(6)
    expect(toMediaTime(3, window)).toBe(5)
    expect(toMediaTime(-1, window)).toBe(2)
    expect(toMediaTime(60, window)).toBe(8)
  })

  it('keeps the window inside media that is shorter than the trim says', () => {
    expect(visibleWindow({ startMs: 2000, endMs: 8000 }, 5)).toEqual({ start: 2, end: 5 })
    expect(visibleWindow({ startMs: 7000, endMs: 8000 }, 5)).toEqual({ start: 5, end: 5 })
  })

  it('finds the hover thumbnail in the sprite grid', () => {
    const sprite = { columns: 10, count: 25, intervalMs: 2000, tileWidth: 160, tileHeight: 90 }
    expect(spriteTile(sprite, 0)).toEqual({ x: 0, y: 0 })
    expect(spriteTile(sprite, 23)).toEqual({ x: 160, y: 90 })
    expect(spriteTile(sprite, 999)).toEqual({ x: 640, y: 180 })
    expect(spriteTile(sprite, -5)).toEqual({ x: 0, y: 0 })
  })

  it.each([
    ['90', 90],
    ['12.5', 12.5],
    ['1:30', 90],
    ['1:02:03', 3723],
    ['1m30s', 90],
    ['2h', 7200],
    ['45s', 45],
    ['', 0],
    ['abc', 0],
    [null, 0],
  ])('parses start time %j', (raw, seconds) => {
    expect(parseStartTime(raw)).toBe(seconds)
  })

  it('formats clock times', () => {
    expect(formatClock(7.9)).toBe('0:07')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3723)).toBe('1:02:03')
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})
