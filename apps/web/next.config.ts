import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Workspace packages ship TypeScript sources.
  transpilePackages: ['@weft/core', '@weft/i18n', '@weft/recorder'],
  // The browser only talks to this origin; /api is proxied to the API server so auth
  // cookies stay first-party.
  // The Content-Security-Policy (with a per-request nonce) is set in src/proxy.ts.
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ]
    return [
      {
        source: '/((?!embed/).*)',
        headers: [
          ...common,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // The recorder asks for the screen, camera and microphone; nothing else does.
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
          },
        ],
      },
      {
        // Only the embed player may be framed by other sites.
        source: '/embed/:path*',
        headers: [
          ...common,
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), display-capture=(), geolocation=()',
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }]
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
