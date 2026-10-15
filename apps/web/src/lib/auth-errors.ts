import type messages from '../../messages/en.json'

export type AuthErrorKey = keyof (typeof messages)['auth']['errors']

/** Better Auth error codes that have a dedicated, translated message under `auth.errors`. */
const KNOWN_AUTH_ERRORS: ReadonlySet<string> = new Set<Exclude<AuthErrorKey, 'generic'>>([
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_EMAIL',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
])

/** Maps a Better Auth error code to a message key, falling back to `generic`. */
export function authErrorKey(code: string | undefined): AuthErrorKey {
  return code && KNOWN_AUTH_ERRORS.has(code) ? (code as AuthErrorKey) : 'generic'
}
