import type messages from '../../messages/en.json'

export type ErrorKey = keyof (typeof messages)['errors']

const KNOWN_ERRORS: ReadonlySet<string> = new Set<Exclude<ErrorKey, 'generic'>>([
  'unreachable',
  'unexpected_response',
  'load_failed',
  'internal_error',
])

/** Maps an API or client error code to a message key under `errors`, falling back to `generic`. */
export function errorKey(code: string): ErrorKey {
  return KNOWN_ERRORS.has(code) ? (code as ErrorKey) : 'generic'
}
