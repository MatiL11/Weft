export type AuthMode = 'sign-in' | 'sign-up'

export interface AuthFormValues {
  name: string
  email: string
  password: string
}

export const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ValidationKey = 'nameRequired' | 'emailInvalid' | 'passwordTooShort'
export type AuthFormErrors = Partial<Record<keyof AuthFormValues, ValidationKey>>

/** Client-side validation; the server validates again. Returns field → message key. */
export function validateAuthForm(mode: AuthMode, values: AuthFormValues): AuthFormErrors {
  const errors: AuthFormErrors = {}

  if (mode === 'sign-up' && values.name.trim().length === 0) {
    errors.name = 'nameRequired'
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'emailInvalid'
  }
  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = 'passwordTooShort'
  }
  return errors
}
