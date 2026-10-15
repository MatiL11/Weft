import { describe, expect, it } from 'vitest'
import { validateAuthForm } from './auth-form'

const VALID = { name: 'Ana', email: 'ana@example.com', password: 'supersecret' }

describe('validateAuthForm', () => {
  it('accepts valid sign-up values', () => {
    expect(validateAuthForm('sign-up', VALID)).toEqual({})
  })

  it('requires a name only when signing up', () => {
    const values = { ...VALID, name: '  ' }
    expect(validateAuthForm('sign-up', values)).toEqual({ name: 'Tell us your name.' })
    expect(validateAuthForm('sign-in', values)).toEqual({})
  })

  it('rejects malformed emails and short passwords', () => {
    expect(validateAuthForm('sign-in', { ...VALID, email: 'ana@', password: 'short' })).toEqual({
      email: 'Enter a valid email address.',
      password: 'Use at least 8 characters.',
    })
  })
})
