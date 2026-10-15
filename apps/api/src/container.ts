import { randomUUID } from 'node:crypto'
import { CreateWorkspace, type Clock, type IdGenerator } from '@weft/core'
import type { Locale } from '@weft/i18n'
import { connectDatabase, DrizzleWorkspaceRepository } from '@weft/infra-db'
import type { Hono } from 'hono'
import type { Logger } from 'pino'
import { createAuth } from './auth'
import type { Config } from './config'
import { createApp } from './http/app'

const systemClock: Clock = { now: () => new Date() }
const uuidIds: IdGenerator = { next: () => randomUUID() }

export interface Container {
  app: Hono
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

/** Composition root: wires infrastructure adapters into use cases and HTTP delivery. */
export function createContainer(config: Config, logger: Logger): Container {
  const database = connectDatabase(config.DATABASE_URL)
  const workspaces = new DrizzleWorkspaceRepository(database.db)
  const createWorkspace = new CreateWorkspace({ workspaces, ids: uuidIds, clock: systemClock })

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
    logger,
  })

  return { app: app as unknown as Hono, close: database.close }
}
