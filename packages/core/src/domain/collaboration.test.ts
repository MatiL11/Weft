import { describe, expect, it } from 'vitest'
import { isReactionEmoji, normalizeCommentBody, toRecordingMs, toVisibleMs } from './collaboration'

describe('collaboration', () => {
  it('normalizes comment bodies', () => {
    expect(normalizeCommentBody('  Hola\r\nmundo  ')).toBe('Hola\nmundo')
    expect(() => normalizeCommentBody('   ')).toThrowError(
      expect.objectContaining({ code: 'comment.body_invalid' }),
    )
    expect(() => normalizeCommentBody('x'.repeat(2001))).toThrowError(
      expect.objectContaining({ code: 'comment.body_invalid' }),
    )
  })

  it('maps timestamps between what viewers see and the recording', () => {
    const trimmed = { trim: { startMs: 2000, endMs: 8000 }, durationMs: 10_000 }
    expect(toRecordingMs(trimmed, 1500.4)).toBe(3500)
    expect(toVisibleMs(trimmed, 3500)).toBe(1500)
    expect(toVisibleMs(trimmed, 1000)).toBeNull()
    expect(toVisibleMs(trimmed, 9000)).toBeNull()
    expect(() => toRecordingMs(trimmed, 7000)).toThrowError(
      expect.objectContaining({ code: 'comment.timestamp_invalid' }),
    )
    expect(() => toRecordingMs(trimmed, -1)).toThrow()

    const whole = { trim: null, durationMs: 10_000 }
    expect(toRecordingMs(whole, 10_000)).toBe(10_000)
    expect(toVisibleMs(whole, 4000)).toBe(4000)
    // While recording the length isn't known yet.
    expect(toRecordingMs({ trim: null, durationMs: null }, 60_000)).toBe(60_000)
  })

  it('accepts only the offered emojis', () => {
    expect(isReactionEmoji('🔥')).toBe(true)
    expect(isReactionEmoji('💩')).toBe(false)
  })
})
