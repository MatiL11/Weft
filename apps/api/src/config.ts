import { z } from 'zod'

/** A generated secret: long enough, and not the placeholder from .env.example. */
const secret = (name: string, minLength: number) =>
  z
    .string()
    .min(minLength, `${name} must be at least ${minLength} characters`)
    .refine(
      (value) => !/change-me/i.test(value),
      `${name} is still the example value; generate one`,
    )

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  /** Public URL users open in the browser (the web app proxies /api to this server). */
  PUBLIC_URL: z.url().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: secret('BETTER_AUTH_SECRET', 32),
  RUN_MIGRATIONS: z.stringbool().default(true),
  /** Anyone can sign up when true; otherwise only the first account and invited people. */
  OPEN_SIGNUP: z.stringbool().default(false),
  /** S3-compatible storage as reached by this server (e.g. http://seaweedfs:8333). */
  S3_ENDPOINT: z.url(),
  /** The same storage as reached by browsers; presigned URLs point here. */
  S3_PUBLIC_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3).default('weft'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: secret('S3_SECRET_ACCESS_KEY', 16),
  MIGRATIONS_DIR: z.string().optional(),
  /** Proxies in front of the API that add to X-Forwarded-For: 1 for the bundled edge proxy. */
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
