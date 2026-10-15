import { describe, expect, it } from 'vitest'
import { formatDuration, recordingFilename } from './recording-format'

describe('formatDuration', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [1_000, '00:01'],
    [65_400, '01:05'],
    [59 * 60_000 + 59_999, '59:59'],
    [3_600_000, '1:00:00'],
    [3_723_000, '1:02:03'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })

  it('treats negative or invalid values as zero', () => {
    expect(formatDuration(-5)).toBe('00:00')
    expect(formatDuration(Number.NaN)).toBe('00:00')
  })
})

describe('recordingFilename', () => {
  it('builds a sortable, filesystem-safe name from the local date', () => {
    expect(recordingFilename(new Date(2026, 9, 5, 9, 7))).toBe('weft-2026-10-05-0907.mp4')
  })
})
