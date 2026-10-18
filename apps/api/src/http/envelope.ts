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

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 500

/** Domain error codes whose HTTP status is not a plain 400. */
const STATUS_BY_SUFFIX: [suffix: string, status: ErrorStatus][] = [
  ['.not_found', 404],
  ['.forbidden', 403],
  ['.password_required', 401],
  ['.sign_in_required', 401],
  ['.password_incorrect', 403],
  ['.wrong_account', 403],
  ['.already_member', 409],
  ['invitation.expired', 410],
  ['invitation.revoked', 410],
  ['invitation.accepted', 410],
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
