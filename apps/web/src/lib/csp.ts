/**
 * The Content-Security-Policy for app pages. Scripts run only from this origin or with the
 * per-request nonce; media, thumbnails and uploads go straight to object storage, so its
 * origin is allowed for those. Only the embed player may be framed by other sites.
 */
export interface CspOptions {
  nonce: string
  /** Origin browsers reach object storage at (presigned uploads and playback). */
  storageOrigin: string | null
  /** The embeddable player, framed by other sites. */
  isEmbed: boolean
  /** React needs eval in development for its debugging tools. */
  isDev: boolean
  /** Ask browsers to upgrade http subresources (only when the app itself is served over https). */
  upgradeInsecure: boolean
}

export function buildCsp(options: CspOptions): string {
  const storage = options.storageOrigin ? ` ${options.storageOrigin}` : ''
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${options.isDev ? " 'unsafe-eval'" : ''}`,
    // React style attributes (e.g. progress widths) are inline.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${storage}`,
    `media-src 'self' blob:${storage}`,
    `connect-src 'self'${storage}`,
    "font-src 'self'",
    // The HLS player runs its demuxer in a blob worker.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${options.isEmbed ? '*' : "'self'"}`,
  ]
  if (options.upgradeInsecure) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

/** The origin part of a URL, or null when it isn't a valid http(s) URL. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
  } catch {
    return null
  }
}
