import { randomBytes, randomUUID } from 'node:crypto'
import {
  CreateWorkspace,
  type Clock,
  type IdGenerator,
  type RenderQueue,
  type TranscriptionQueue,
} from '@weft/core'
import type { Locale } from '@weft/i18n'
import {
  connectDatabase,
  DrizzleTranscriptRepository,
  DrizzleVideoRepository,
  DrizzleWorkspaceRepository,
} from '@weft/infra-db'
import { PgBossJobs } from '@weft/infra-jobs'
import { S3ObjectStorage } from '@weft/infra-storage'
import type { Hono } from 'hono'
import type { Logger } from 'pino'
import { createAuth } from './auth'
import type { Config } from './config'
import { createApp } from './http/app'
import {
  FailureLimiter,
  HmacVideoAccessTokens,
  ScryptPasswordHasher,
  UnlockLimiter,
} from './security'
import { videoUseCases } from './use-cases'

const systemClock: Clock = { now: () => new Date() }
const uuidIds: IdGenerator = { next: () => randomUUID() }
/**
 * Video ids double as unguessable share-link tokens ("anyone with the link"):
 * 128 random bits, base64url, 22 characters.
 */
const videoIds: IdGenerator = { next: () => randomBytes(16).toString('base64url') }

export interface Container {
  app: Hono
  storage: S3ObjectStorage
  close(): Promise<void>
}

const PERSONAL_WORKSPACE_NAMES: Record<
  Locale,
  { named: (firstName: string) => string; fallback: string }
> = {
  en: { named: (firstName) => `${firstName}'s workspace`, fallback: 'My workspace' },
  es: { named: (firstName) => `Espacio de ${firstName}`, fallback: 'Mi espacio' },
}

export function personalWorkspaceName(userName: string, locale: Locale): string {
  const firstName = userName.trim().split(/\s+/)[0]
  const names = PERSONAL_WORKSPACE_NAMES[locale]
  return firstName ? names.named(firstName) : names.fallback
}

/** Wrong video passwords allowed per window, per client and video and per video overall. */
const UNLOCK_FAILURES_PER_CLIENT = 10
const UNLOCK_FAILURES_PER_VIDEO = 200
const UNLOCK_WINDOW_MS = 15 * 60 * 1000

export interface ContainerOverrides {
  /** Replaces the PostgreSQL job queue (e.g. in tests). */
  renders?: RenderQueue & TranscriptionQueue
}

/** Composition root: wires infrastructure adapters into use cases and HTTP delivery. */
export async function createContainer(
  config: Config,
  logger: Logger,
  overrides: ContainerOverrides = {},
): Promise<Container> {
  const database = connectDatabase(config.DATABASE_URL)
  const jobs = overrides.renders
    ? null
    : await PgBossJobs.start({
        connectionString: config.DATABASE_URL,
        onError: (error) => logger.error({ err: error }, 'job queue error'),
      })
  const workspaces = new DrizzleWorkspaceRepository(database.db)
  const createWorkspace = new CreateWorkspace({ workspaces, ids: uuidIds, clock: systemClock })
  const storage = new S3ObjectStorage({
    endpoint: config.S3_ENDPOINT,
    publicEndpoint: config.S3_PUBLIC_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  })
  const useCases = videoUseCases({
    videos: new DrizzleVideoRepository(database.db),
    workspaces,
    storage,
    renders: overrides.renders ?? (jobs as PgBossJobs),
    transcriptions: overrides.renders ?? (jobs as PgBossJobs),
    transcripts: new DrizzleTranscriptRepository(database.db),
    passwords: new ScryptPasswordHasher(),
    accessTokens: new HmacVideoAccessTokens(config.BETTER_AUTH_SECRET),
    ids: videoIds,
    clock: systemClock,
  })

  const auth = createAuth({
    db: database.db,
    secret: config.BETTER_AUTH_SECRET,
    publicUrl: config.PUBLIC_URL,
    onUserCreated: async (user) => {
      await createWorkspace.execute({
        ownerId: user.id,
        name: personalWorkspaceName(user.name, user.locale),
      })
    },
  })

  const app = createApp({
    authHandler: (request) => auth.handler(request),
    getSessionUser: async (headers) => {
      const session = await auth.api.getSession({ headers })
      return session ? { id: session.user.id } : null
    },
    workspaces,
    createWorkspace,
    ...useCases,
    unlockLimiter: new UnlockLimiter(
      new FailureLimiter(UNLOCK_FAILURES_PER_CLIENT, UNLOCK_WINDOW_MS),
      new FailureLimiter(UNLOCK_FAILURES_PER_VIDEO, UNLOCK_WINDOW_MS),
    ),
    publicUrl: config.PUBLIC_URL,
    logger,
  })

  return {
    app: app as unknown as Hono,
    storage,
    close: async () => {
      await jobs?.stop()
      await database.close()
    },
  }
}
