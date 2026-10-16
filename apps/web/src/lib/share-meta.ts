/** Helpers for share links, embeds and their metadata. */
import { parseStartTime } from './player-timeline'

interface HeaderReader {
  get(name: string): string | null
}

/** The public origin of this request, honoring a reverse proxy's forwarded headers. */
export function requestOrigin(headers: HeaderReader): string {
  const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host')
  const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

export const EMBED_SIZE = { width: 960, height: 540 } as const

export function embedSnippet(origin: string, videoId: string): string {
  const { width, height } = EMBED_SIZE
  return `<iframe src="${origin}/embed/${videoId}" width="${width}" height="${height}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`
}

export interface EmbedOptions {
  autoplay: boolean
  muted: boolean
  hideTitle: boolean
  /** Seconds into the video. */
  startAt: number
}

const isOn = (value: string | string[] | undefined) =>
  typeof value === 'string' && ['1', 'true', 'yes'].includes(value.toLowerCase())

/** Reads ?t=, ?autoplay=, ?muted= and ?hide_title= from an embed or share URL. */
export function parseEmbedOptions(
  params: Record<string, string | string[] | undefined>,
): EmbedOptions {
  const autoplay = isOn(params.autoplay)
  return {
    autoplay,
    // Browsers only autoplay muted video, so autoplay implies muted.
    muted: autoplay || isOn(params.muted),
    hideTitle: isOn(params.hide_title),
    startAt: parseStartTime(typeof params.t === 'string' ? params.t : null),
  }
}
