/**
 * Error raised when a domain invariant is violated. `code` is a stable,
 * machine-readable identifier that delivery layers map to responses.
 */
export class DomainError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}
