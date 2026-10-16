import { tmpdir } from 'node:os'
import { z } from 'zod'

const ConfigSchema = z.object({
  DATABASE_URL: z.url(),
  S3_ENDPOINT: z.url(),
  /** Not used by the worker itself, but shared with the API's storage settings. */
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3).default('weft'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),
  /** Renders processed in parallel by this worker; each one can use every CPU core. */
  RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  /** Scratch space for renders (needs roughly 3× the size of the largest recording). */
  WORK_DIR: z.string().min(1).default(tmpdir()),
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
