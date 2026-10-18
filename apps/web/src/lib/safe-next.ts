/**
 * Where to go after signing in. Only same-site paths are allowed, so a crafted link can't
 * send people to another website (open redirect).
 */
export function safeNextPath(raw: string | string[] | null | undefined): string {
  if (typeof raw !== 'string') return '/'
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  return raw
}
