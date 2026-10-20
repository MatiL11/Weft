import { z } from 'zod'

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  /** Public URL users open in the browser (the web app proxies /api to this server). */
  PUBLIC_URL: z.url().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  RUN_MIGRATIONS: z.stringbool().default(true),
  /** false: only the first account and people with a pending invitation can sign up. */
  OPEN_SIGNUP: z.stringbool().default(true),
  /** S3-compatible storage as reached by this server (e.g. http://seaweedfs:8333). */
  S3_ENDPOINT: z.url(),
  /** The same storage as reached by browsers; presigned URLs point here. */
  S3_PUBLIC_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3).default('weft'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
  MIGRATIONS_DIR: z.string().optional(),
  /** Proxies in front of the API that add to X-Forwarded-For: 1 for the bundled web app. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export type Config = z.infer<typeof ConfigSchema>

/** Parses and validates environment variables, failing fast with a readable message. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = ConfigSchema.safeParse(env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid configuration:\n${issues}`)
  }
  return result.data
}
