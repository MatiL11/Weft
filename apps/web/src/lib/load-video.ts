import { cookies, headers } from 'next/headers'
import { requestOrigin } from './share-meta'
import { fetchVideoSummary } from './video-summary'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'
/** Configured public URL; request headers are only a fallback (they can be spoofed). */
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, '')

/** Loads a video for the current request, as the viewer (their cookies) sees it. */
export async function loadVideo(id: string) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const result = await fetchVideoSummary(API_INTERNAL_URL, id, cookieStore.toString())
  return { result, origin: PUBLIC_URL || requestOrigin(headerStore) }
}
