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

/** Maps an unknown error to a safe response; never leaks internal messages. */
export function toErrorResponse(error: unknown): { status: 400 | 500; body: ApiResponse<never> } {
  if (error instanceof DomainError) {
    return { status: 400, body: fail(error.code, error.message) }
  }
  return { status: 500, body: fail('internal_error', 'Something went wrong.') }
}
