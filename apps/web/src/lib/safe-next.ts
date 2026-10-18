/**
 * Where to go after signing in. Only same-site paths are allowed, so a crafted link can't
 * send people to another website (open redirect).
 */
export function safeNextPath(raw: string | string[] | null | undefined): string {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return '/'
  // Browsers drop tabs and newlines and read "\\" as "/", so "/\t/evil.com" would leave the site.
  if ([...raw].some((char) => char.charCodeAt(0) < 0x20 || char === '\x7f' || char === '\\')) {
    return '/'
  }
  // Final check: resolved against this site, it must stay on this site.
  const base = 'http://weft.invalid'
  try {
    const url = new URL(raw, base)
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : '/'
  } catch {
    return '/'
  }
}
