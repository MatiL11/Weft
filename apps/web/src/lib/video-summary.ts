export interface VideoSummary {
  id: string
  title: string
  status: 'recording' | 'ready'
  privacy: 'link' | 'workspace' | 'private'
  durationMs: number | null
  createdAt: string
  isOwner: boolean
}

export type VideoSummaryResult =
  { kind: 'ok'; video: VideoSummary } | { kind: 'not_found' } | { kind: 'error' }

/** Video ids are URL-safe base64 tokens; anything else is rejected before reaching the API. */
const VIDEO_ID = /^[A-Za-z0-9_-]{1,64}$/

export async function fetchVideoSummary(
  apiBaseUrl: string,
  id: string,
  cookieHeader: string,
): Promise<VideoSummaryResult> {
  if (!VIDEO_ID.test(id)) return { kind: 'not_found' }
  try {
    const res = await fetch(`${apiBaseUrl}/api/videos/${id}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (res.status === 404) return { kind: 'not_found' }
    if (!res.ok) return { kind: 'error' }
    const body = (await res.json()) as { data: VideoSummary | null }
    return body.data ? { kind: 'ok', video: body.data } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}
