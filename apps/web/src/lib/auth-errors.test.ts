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
    'SIGN_UP_INVITE_ONLY',
  ])('maps known code %s to its own message key', (code) => {
    expect(authErrorKey({ code, status: 400 })).toBe(code)
  })

  it.each([undefined, '', 'SOMETHING_NEW', 'toString'])('falls back to generic for %j', (code) => {
    expect(authErrorKey({ code })).toBe('generic')
  })

  it('maps rate limiting (which has no code) by its status', () => {
    expect(authErrorKey({ status: 429 })).toBe('TOO_MANY_REQUESTS')
  })
})
