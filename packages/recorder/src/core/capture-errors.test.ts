import { describe, expect, it } from 'vitest'
import { captureErrorCode } from './capture-errors'

describe('captureErrorCode', () => {
  it.each([
    ['NotAllowedError', 'permission_denied'],
    ['SecurityError', 'permission_denied'],
    ['NotFoundError', 'device_not_found'],
    ['OverconstrainedError', 'device_not_found'],
    ['NotReadableError', 'device_busy'],
    ['AbortError', 'capture_cancelled'],
    ['TypeError', 'capture_failed'],
  ])('maps %s to %s', (name, code) => {
    expect(captureErrorCode({ name })).toBe(code)
  })

  it.each([null, undefined, 'boom', 42])('maps unknown value %j to capture_failed', (error) => {
    expect(captureErrorCode(error)).toBe('capture_failed')
  })
})
