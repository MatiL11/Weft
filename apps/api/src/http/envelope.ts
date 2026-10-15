import { DomainError } from '@weft/core'

export interface ApiError {
  code: string
  message: string
}

export interface ApiResponse<T> {
  data: T | null
  error: ApiError | null
}

export function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null }
}

export function fail(code: string, message: string): ApiResponse<never> {
  return { data: null, error: { code, message } }
}

export type ErrorStatus = 400 | 403 | 404 | 409 | 500

/** Domain error codes whose HTTP status is not a plain 400. */
const STATUS_BY_SUFFIX: [suffix: string, status: ErrorStatus][] = [
  ['.not_found', 404],
  ['.forbidden', 403],
  ['.not_recording', 409],
  ['.segments_missing', 409],
]

function statusFor(code: string): ErrorStatus {
  return STATUS_BY_SUFFIX.find(([suffix]) => code.endsWith(suffix))?.[1] ?? 400
}

/** Maps an unknown error to a safe response; never leaks internal messages. */
export function toErrorResponse(error: unknown): { status: ErrorStatus; body: ApiResponse<never> } {
  if (error instanceof DomainError) {
    return { status: statusFor(error.code), body: fail(error.code, error.message) }
  }
  return { status: 500, body: fail('internal_error', 'Something went wrong.') }
}
