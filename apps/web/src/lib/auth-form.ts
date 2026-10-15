export type AuthMode = 'sign-in' | 'sign-up'

export interface AuthFormValues {
  name: string
  email: string
  password: string
}

export const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Client-side validation; the server validates again. Returns field → message. */
export function validateAuthForm(
  mode: AuthMode,
  values: AuthFormValues,
): Partial<Record<keyof AuthFormValues, string>> {
  const errors: Partial<Record<keyof AuthFormValues, string>> = {}

  if (mode === 'sign-up' && values.name.trim().length === 0) {
    errors.name = 'Tell us your name.'
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return errors
}
