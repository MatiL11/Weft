import {
  buildMasterPlaylist,
  buildMediaPlaylist,
  buildWebVtt,
  DomainError,
  renditionDirectory,
  type GetPlayback,
  type Playback,
  type UnlockVideo,
} from '@weft/core'
import { Hono, type Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { fail, ok } from '../envelope'
import { presentVideo } from '../presenters'
import { invalid, parseJson } from '../validation'

export interface PlaybackRouteDeps {
  getPlayback: GetPlayback
  unlockVideo: UnlockVideo
  /** Limits wrong password guesses. */
  unlockLimiter: {
    isBlocked(videoId: string, client: string): boolean
    recordFailure(videoId: string, client: string): void
  }
  publicUrl: string
}

const HLS_CONTENT_TYPE = 'application/vnd.apple.mpegurl'
/** Presigned media URLs live for an hour; redirects may be cached for a few minutes. */
const MEDIA_REDIRECT_CACHE = 'private, max-age=300'
const ACCESS_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const UnlockBody = z.object({ password: z.string().max(1024) })

/** Cookie holding the proof that this browser entered the video's password. */
export const accessCookieName = (videoId: string) => `weft_access_${videoId}`

/** The client's address as forwarded by the web app's proxy (best effort). */
export const clientOf = (c: Context) =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'

const assetMissing = () => new DomainError('asset.not_found', 'This file does not exist.')

/** Watching videos. Anonymous access is allowed; GetPlayback enforces privacy. */
export function playbackRoutes(deps: PlaybackRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  const secureCookies = deps.publicUrl.startsWith('https://')

  const playback = (c: Context<AppEnv>): Promise<Playback> => {
    const videoId = c.req.param('id') ?? ''
    return deps.getPlayback.execute({
      viewerId: c.get('user')?.id ?? null,
      videoId,
      accessToken: getCookie(c, accessCookieName(videoId)) ?? null,
    })
  }

  routes.get('/:id', async (c) => {
    const result = await playback(c)
    const viewerId = c.get('user')?.id ?? null
    const transcript = await result.transcript()
    return c.json(ok(presentVideo(result.video, viewerId, { skip: result.skip, transcript })))
  })

  routes.get('/:id/transcript', async (c) => {
    const transcript = await (await playback(c)).transcript()
    if (!transcript) throw assetMissing()
    c.header('cache-control', 'private, no-cache')
    return c.json(ok({ language: transcript.language, segments: transcript.segments }))
  })

  routes.get('/:id/captions.vtt', async (c) => {
    const transcript = await (await playback(c)).transcript()
    if (!transcript) throw assetMissing()
    return c.body(buildWebVtt(transcript.segments), 200, {
      'content-type': 'text/vtt; charset=utf-8',
      'cache-control': 'private, no-cache',
    })
  })

  routes.post('/:id/unlock', async (c) => {
    const body = await parseJson(c, UnlockBody)
    if (!body) return invalid(c)
    const videoId = c.req.param('id')
    const client = clientOf(c)
    if (deps.unlockLimiter.isBlocked(videoId, client)) {
      return c.json(fail('video.too_many_attempts', 'Too many attempts. Try again later.'), 429)
    }
    const token = await deps.unlockVideo
      .execute({ videoId, password: body.password })
      .catch((error: unknown) => {
        if (error instanceof DomainError && error.code === 'video.password_incorrect') {
          deps.unlockLimiter.recordFailure(videoId, client)
        }
        throw error
      })
    setCookie(c, accessCookieName(videoId), token, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: secureCookies,
      maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
    })
    return c.json(ok({ unlocked: true }))
  })

  routes.get('/:id/playlist.m3u8', async (c) => {
    const result = await playback(c)
    if (result.source.kind === 'render') {
      const { render } = result.source
      const body = buildMasterPlaylist(
        render.renditions.map((r) => ({
          ...r,
          uri: `r/${render.version}/${renditionDirectory(r)}/index.m3u8`,
        })),
      )
      // Re-checked on each load: a new trim switches the video to a new render.
      return c.body(body, 200, { 'content-type': HLS_CONTENT_TYPE, 'cache-control': 'no-cache' })
    }
    const body = buildMediaPlaylist({
      initUri: 'media/init',
      segmentUri: (index) => `media/${index}`,
      segments: result.segments,
      ended: result.ended,
    })
    return c.body(body, 200, {
      'content-type': HLS_CONTENT_TYPE,
      // Live playlists change every few seconds; finished ones are stable.
      'cache-control': result.ended ? 'no-cache' : 'no-store',
    })
  })

  routes.get('/:id/media/:segment', async (c) => {
    const segment = c.req.param('segment')
    const isInit = segment === 'init'
    const index = Number(segment)
    if (!isInit && !(Number.isInteger(index) && index >= 0)) {
      return c.json(fail('validation_error', 'Unknown media segment.'), 400)
    }
    const result = await playback(c)
    const url = await result.mediaUrl(isInit ? 'init' : 'media', isInit ? 0 : index)
    c.header('cache-control', MEDIA_REDIRECT_CACHE)
    return c.redirect(url, 302)
  })

  // Files of a render. The version is part of the URL so each render can be cached apart.
  routes.get('/:id/r/:version/:path{.+}', async (c) => {
    const result = await playback(c)
    if (Number(c.req.param('version')) !== result.video.render?.version) throw assetMissing()
    const path = c.req.param('path')
    if (path.endsWith('.m3u8')) {
      return c.body(await result.readAsset(path), 200, {
        'content-type': HLS_CONTENT_TYPE,
        'cache-control': 'private, max-age=3600',
      })
    }
    c.header('cache-control', MEDIA_REDIRECT_CACHE)
    return c.redirect(await result.assetUrl(path), 302)
  })

  routes.get('/:id/download', async (c) => {
    const result = await playback(c)
    if (result.source.kind !== 'render') throw assetMissing()
    const url = await result.assetUrl('video.mp4', {
      downloadFilename: `${result.video.title}.mp4`,
    })
    c.header('cache-control', 'private, no-store')
    return c.redirect(url, 302)
  })

  return routes
}
