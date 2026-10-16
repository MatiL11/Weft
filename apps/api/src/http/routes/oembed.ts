import { DomainError, type GetPlayback } from '@weft/core'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { fail } from '../envelope'
import { renderAssetPath } from '../presenters'

export interface OEmbedRouteDeps {
  getPlayback: GetPlayback
  publicUrl: string
}

const DEFAULT_WIDTH = 960
const VIDEO_URL = /^\/(?:v|embed)\/([A-Za-z0-9_-]{1,64})\/?$/

/** oEmbed (https://oembed.com) so pasted share links unfurl as players in other apps. */
export function oembedRoutes(deps: OEmbedRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  const base = deps.publicUrl.replace(/\/$/, '')

  routes.get('/', async (c) => {
    const notFound = () => c.json(fail('oembed.not_found', 'No embeddable video at this URL.'), 404)
    if ((c.req.query('format') ?? 'json') !== 'json') {
      return c.json(fail('oembed.format', 'Only JSON is supported.'), 501)
    }
    let url: URL
    try {
      url = new URL(c.req.query('url') ?? '')
    } catch {
      return notFound()
    }
    const videoId = url.origin === new URL(base).origin ? VIDEO_URL.exec(url.pathname)?.[1] : null
    if (!videoId) return notFound()

    // Only videos anyone with the link may watch are embeddable by third parties.
    const playback = await deps.getPlayback
      .execute({ viewerId: null, videoId })
      .catch((error: unknown) => {
        if (error instanceof DomainError) return null
        throw error
      })
    if (!playback || playback.video.privacy !== 'link') return notFound()

    const top = playback.video.render?.renditions[0] ?? { width: 16, height: 9 }
    const maxWidth = Number(c.req.query('maxwidth')) || DEFAULT_WIDTH
    const width = Math.min(DEFAULT_WIDTH, maxWidth)
    const height = Math.round((width * top.height) / top.width)
    const poster = renderAssetPath(playback.video, 'poster.jpg')

    return c.json({
      version: '1.0',
      type: 'video',
      provider_name: 'Weft',
      provider_url: base,
      title: playback.video.title,
      width,
      height,
      html: `<iframe src="${base}/embed/${videoId}" width="${width}" height="${height}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`,
      ...(poster
        ? {
            thumbnail_url: `${base}${poster}`,
            thumbnail_width: top.width,
            thumbnail_height: top.height,
          }
        : {}),
    })
  })

  return routes
}
