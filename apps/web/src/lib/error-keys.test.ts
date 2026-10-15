import { describe, expect, it } from 'vitest'
import { errorKey } from './error-keys'

describe('errorKey', () => {
  it.each(['unreachable', 'unexpected_response', 'load_failed', 'internal_error'])(
    'keeps known code %s',
    (code) => {
      expect(errorKey(code)).toBe(code)
    },
  )

  it.each(['unauthorized', 'validation_error', 'constructor', ''])(
    'falls back to generic for %j',
    (code) => {
      expect(errorKey(code)).toBe('generic')
    },
  )
})
