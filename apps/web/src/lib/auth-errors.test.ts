import { describe, expect, it } from 'vitest'
import { authErrorKey } from './auth-errors'

describe('authErrorKey', () => {
  it.each([
    'USER_ALREADY_EXISTS',
    'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
    'INVALID_EMAIL_OR_PASSWORD',
    'INVALID_EMAIL',
    'PASSWORD_TOO_SHORT',
    'PASSWORD_TOO_LONG',
  ])('maps known code %s to its own message key', (code) => {
    expect(authErrorKey(code)).toBe(code)
  })

  it.each([undefined, '', 'SOMETHING_NEW', 'toString'])('falls back to generic for %j', (code) => {
    expect(authErrorKey(code)).toBe('generic')
  })
})
