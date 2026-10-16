import { UploadError, type UploadApi } from '@weft/recorder/core'
import type { TrimRange, VideoPrivacy, VideoView } from './video-summary'

/** UploadError that also carries the API's error code (e.g. "video.segments_missing"). */
export class VideoApiError extends UploadError {
  constructor(
    message: string,
    retryable: boolean,
    status: number | undefined,
    readonly code: string,
  ) {
    super(message, retryable, status)
    this.name = 'VideoApiError'
  }
}

const isRetryable = (status: number) => status === 408 || status === 429 || status >= 500

async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  let response: Response
  try {
    response = await fetch(
      path,
      body === undefined
        ? { method }
        : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    )
  } catch {
    throw new VideoApiError('Network error', true, undefined, 'unreachable')
  }
  const payload = (await response.json().catch(() => null)) as {
    data: T
    error: { code: string; message: string } | null
  } | null
  if (!response.ok || !payload || payload.error) {
    const code = payload?.error?.code ?? 'unexpected_response'
    throw new VideoApiError(code, isRetryable(response.status), response.status, code)
  }
  return payload.data
}

export interface StartedVideo {
  id: string
  shareUrl: string
}

/** Creates the video when recording starts; its share link works immediately. */
export async function startVideo(title: string): Promise<StartedVideo> {
  const data = await call<{ video: { id: string }; shareUrl: string }>('/api/videos', { title })
  return { id: data.video.id, shareUrl: data.shareUrl }
}

/** Binds the recorder's upload protocol to the Weft API for one video. */
export function createUploadApi(videoId: string): UploadApi {
  const base = `/api/videos/${encodeURIComponent(videoId)}`
  return {
    prepare: (request) => call<{ url: string }>(`${base}/segments`, request),
    confirm: async (segment) => void (await call(`${base}/segments/confirm`, segment)),
    complete: async (summary) => void (await call(`${base}/complete`, summary)),
  }
}

/** Deletes a video and its media (e.g. a discarded recording). */
export async function deleteVideo(videoId: string): Promise<void> {
  await call(`/api/videos/${encodeURIComponent(videoId)}`, undefined, 'DELETE')
}

const videoPath = (videoId: string) => `/api/videos/${encodeURIComponent(videoId)}`

export interface VideoChanges {
  title?: string
  privacy?: VideoPrivacy
  password?: string
  trim?: TrimRange | null
}

/** Owner edits; a new trim queues a re-render. */
export function updateVideo(videoId: string, changes: VideoChanges): Promise<VideoView> {
  return call<VideoView>(videoPath(videoId), changes, 'PATCH')
}

/** Retries processing a finished recording. */
export function requestRender(videoId: string): Promise<VideoView> {
  return call<VideoView>(`${videoPath(videoId)}/render`)
}

export function fetchVideo(videoId: string): Promise<VideoView> {
  return call<VideoView>(videoPath(videoId), undefined, 'GET')
}

/** Sends a viewer's password; on success the API sets an access cookie for this video. */
export async function unlockVideo(videoId: string, password: string): Promise<void> {
  await call(`${videoPath(videoId)}/unlock`, { password })
}
