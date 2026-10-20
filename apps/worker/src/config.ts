import { availableParallelism, tmpdir } from 'node:os'
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
  DATABASE_URL: z.url(),
  S3_ENDPOINT: z.url(),
  /** Not used by the worker itself, but shared with the API's storage settings. */
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3).default('weft'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: secret('S3_SECRET_ACCESS_KEY', 16),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),
  /** Renders processed in parallel by this worker; each one can use every CPU core. */
  RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  WHISPER_CLI_PATH: z.string().min(1).default('whisper-cli'),
  /** Multilingual model downloaded on first start (verified against its published checksum). */
  WHISPER_MODEL: z.enum(['tiny', 'base', 'small', 'medium']).default('base'),
  WHISPER_MODELS_DIR: z.string().min(1).default('/models'),
  /** Use your own model file instead of downloading one. */
  WHISPER_MODEL_PATH: z.string().min(1).optional(),
  WHISPER_THREADS: z.coerce
    .number()
    .int()
    .min(1)
    .max(64)
    .default(Math.min(8, availableParallelism())),
  TRANSCRIBE_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  /** Public URL of the web app, for links in emails. */
  PUBLIC_URL: z.url().default('http://localhost:3000'),
  /** SMTP server for emails, e.g. smtp://user:pass@smtp.example.com:587; unset disables email. */
  // Compose passes unset variables as '', which means "not configured" here.
  SMTP_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^smtps?:\/\//, 'must start with smtp:// or smtps://')
      .optional(),
  ),
  MAIL_FROM: z.string().min(3).default('Weft <weft@localhost>'),
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
