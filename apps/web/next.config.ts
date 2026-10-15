import type { NextConfig } from 'next'

const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // The browser only talks to this origin; /api is proxied to the API server so auth
  // cookies stay first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }]
  },
}

export default nextConfig
