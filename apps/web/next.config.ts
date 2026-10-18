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
  async headers() {
    return [
      // Only the embed player may be framed by other sites.
      {
        source: '/((?!embed/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: '/embed/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
    ]
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }]
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
