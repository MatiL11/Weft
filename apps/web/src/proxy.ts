import { NextResponse, type NextRequest } from 'next/server'
import { buildCsp, originOf } from '@/lib/csp'

/** Gives every page a fresh script nonce and the Content-Security-Policy that requires it. */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp({
    nonce,
    // Read per request: these are runtime settings of the deployed image.
    storageOrigin: originOf(process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:8333'),
    isEmbed: request.nextUrl.pathname.startsWith('/embed/'),
    isDev: process.env.NODE_ENV === 'development',
    upgradeInsecure: originOf(process.env.PUBLIC_URL)?.startsWith('https:') ?? false,
  })

  // Next reads the nonce from the request's policy and adds it to the scripts it renders.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      // Pages only: the API, static files and prefetches don't need a policy.
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
