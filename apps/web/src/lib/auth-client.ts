'use client'

import { createAuthClient } from 'better-auth/react'

// Same-origin: Next.js proxies /api/auth/* to the API server.
export const authClient = createAuthClient()
