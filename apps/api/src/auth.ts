import { localeFromHeaders, type Locale } from '@weft/i18n'
import { authSchema, type Database } from '@weft/infra-db'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { CLIENT_IP_HEADER } from './http/context'

export interface CreatedUser {
  id: string
  name: string
  /** Language negotiated from the sign-up request (locale cookie, then Accept-Language). */
  locale: Locale
}

export interface AuthOptions {
  db: Database
  secret: string
  publicUrl: string
  /** Whether this email may create an account (e.g. invite-only instances). */
  allowSignUp: (email: string) => Promise<boolean>
  /** Runs right after a user row is created (e.g. to provision a personal workspace). */
  onUserCreated: (user: CreatedUser) => Promise<void>
}

export function createAuth(options: AuthOptions) {
  return betterAuth({
    appName: 'Weft',
    baseURL: options.publicUrl,
    basePath: '/api/auth',
    secret: options.secret,
    trustedOrigins: [options.publicUrl],
    database: drizzleAdapter(options.db, { provider: 'pg', schema: authSchema }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!(await options.allowSignUp(user.email))) {
              throw new APIError('FORBIDDEN', {
                code: 'SIGN_UP_INVITE_ONLY',
                message: 'This server only accepts new accounts by invitation.',
              })
            }
          },
          after: async (user, context) => {
            const headers = context?.headers ?? context?.request?.headers
            await options.onUserCreated({
              id: user.id,
              name: user.name,
              locale: localeFromHeaders(headers),
            })
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
