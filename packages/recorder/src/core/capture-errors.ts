export type CaptureErrorCode =
  'permission_denied' | 'device_not_found' | 'device_busy' | 'capture_cancelled' | 'capture_failed'

const BY_NAME: Record<string, CaptureErrorCode> = {
  NotAllowedError: 'permission_denied',
  SecurityError: 'permission_denied',
  NotFoundError: 'device_not_found',
  OverconstrainedError: 'device_not_found',
  NotReadableError: 'device_busy',
  AbortError: 'capture_cancelled',
}

/** Maps a getUserMedia/getDisplayMedia rejection (a DOMException) to a stable error code. */
export function captureErrorCode(error: unknown): CaptureErrorCode {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  return BY_NAME[name] ?? 'capture_failed'
}
