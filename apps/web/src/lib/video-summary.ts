export type VideoPrivacy = 'link' | 'workspace' | 'password' | 'private'
export const VIDEO_PRIVACIES: readonly VideoPrivacy[] = ['link', 'workspace', 'password', 'private']
export type RenderState = 'none' | 'queued' | 'processing' | 'ready' | 'failed'
export type TranscriptionState = RenderState | 'no_audio'
export const TRANSCRIPT_LANGUAGES = ['auto', 'en', 'es', 'pt', 'fr', 'de', 'it'] as const
export type TranscriptLanguage = (typeof TRANSCRIPT_LANGUAGES)[number]

export interface TrimRange {
  startMs: number
  endMs: number
}

export interface ThumbnailSprite {
  url: string
  columns: number
  count: number
  intervalMs: number
  tileWidth: number
  tileHeight: number
}

/** A video as the API presents it (see apps/api presenters). */
export interface VideoView {
  id: string
  title: string
  status: 'recording' | 'ready'
  privacy: VideoPrivacy
  createdAt: string
  /** After trimming. */
  durationMs: number | null
  isOwner: boolean
  folderId: string | null
  trashedAt: string | null
  playback: {
    playlistUrl: string
    /** Parts of the raw recording to hide until a matching render exists. */
    skip: TrimRange | null
    processed: boolean
  }
  posterUrl: string | null
  thumbnails: ThumbnailSprite | null
  downloadUrl: string | null
  /** Present once the current render has a transcript. */
  captions: { language: string; transcriptUrl: string; vttUrl: string } | null
  owner: {
    renderState: RenderState
    recordingDurationMs: number | null
    trim: TrimRange | null
    hasPassword: boolean
    transcriptionState: TranscriptionState
    transcriptLanguage: TranscriptLanguage
  } | null
}

export type VideoSummaryResult =
  | { kind: 'ok'; video: VideoView }
  | { kind: 'not_found' }
  | { kind: 'password_required' }
  | { kind: 'error' }

/** Video ids are URL-safe base64 tokens; anything else is rejected before reaching the API. */
const VIDEO_ID = /^[A-Za-z0-9_-]{1,64}$/

export const isVideoId = (id: string) => VIDEO_ID.test(id)

export async function fetchVideoSummary(
  apiBaseUrl: string,
  id: string,
  cookieHeader: string,
): Promise<VideoSummaryResult> {
  if (!isVideoId(id)) return { kind: 'not_found' }
  try {
    const res = await fetch(`${apiBaseUrl}/api/videos/${id}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (res.status === 404) return { kind: 'not_found' }
    if (res.status === 401) return { kind: 'password_required' }
    if (!res.ok) return { kind: 'error' }
    const body = (await res.json()) as { data: VideoView | null }
    return body.data ? { kind: 'ok', video: body.data } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

/** A library entry; `match` is where a search found the query in the transcript. */
export interface LibraryVideo extends VideoView {
  match: { startMs: number; endMs: number; text: string } | null
  /** Views so far, for the caller's own videos. */
  viewCount: number | null
}

export type VideoListResult =
  { kind: 'ok'; videos: LibraryVideo[] } | { kind: 'unauthenticated' } | { kind: 'error' }

/** The signed-in user's library in a workspace (their personal one by default). */
export async function fetchVideoList(
  apiBaseUrl: string,
  cookieHeader: string,
  /** Query string for GET /api/videos (see videoListQuery). */
  listQuery = '',
): Promise<VideoListResult> {
  const query = listQuery ? `?${listQuery}` : ''
  try {
    const res = await fetch(`${apiBaseUrl}/api/videos${query}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (res.status === 401) return { kind: 'unauthenticated' }
    if (!res.ok) return { kind: 'error' }
    const body = (await res.json()) as { data: LibraryVideo[] | null }
    return body.data ? { kind: 'ok', videos: body.data } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}
