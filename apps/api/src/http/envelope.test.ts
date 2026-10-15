import { DomainError } from '@weft/core'
import { describe, expect, it } from 'vitest'
import { toErrorResponse } from './envelope'

describe('toErrorResponse', () => {
  it.each([
    ['video.not_found', 404],
    ['video.segment_unknown', 400],
    ['workspace.forbidden', 403],
    ['video.forbidden', 403],
    ['video.title_invalid', 400],
    ['video.not_recording', 409],
    ['video.segments_missing', 409],
  ])('maps %s to HTTP %i', (code, status) => {
    const result = toErrorResponse(new DomainError(code, 'message'))
    expect(result.status).toBe(status)
    expect(result.body.error).toEqual({ code, message: 'message' })
  })

  it('hides unexpected errors', () => {
    expect(toErrorResponse(new Error('secret'))).toEqual({
      status: 500,
      body: { data: null, error: { code: 'internal_error', message: 'Something went wrong.' } },
    })
  })
})
