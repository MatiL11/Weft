import { UploadError, type UploadTransport } from '../core/upload-queue'

/**
 * Statuses worth retrying: timeouts, rate limits, server errors, and 403 (a presigned URL
 * that expired; the queue fetches a fresh one on retry). Other 4xx are permanent.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 403 || status === 408 || status === 429 || status >= 500
}

/** PUTs bytes to a presigned URL with fetch. */
export const fetchTransport: UploadTransport = {
  async put(url, data, contentType) {
    const response = await fetch(url, {
      method: 'PUT',
      body: data as Uint8Array<ArrayBuffer>,
      headers: { 'content-type': contentType },
    })
    if (!response.ok) {
      throw new UploadError(
        `Upload failed with HTTP ${response.status}`,
        isRetryableStatus(response.status),
        response.status,
      )
    }
  },
}

/** Base64 SHA-256 of the bytes, as expected by S3's x-amz-checksum-sha256. */
export async function sha256Base64(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>),
  )
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return btoa(binary)
}
