import { randomUUID } from 'node:crypto'
import { CreateWorkspace, type Clock, type IdGenerator } from '@weft/core'
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

export function personalWorkspaceName(userName: string): string {
  const firstName = userName.trim().split(/\s+/)[0]
  return firstName ? `${firstName}'s workspace` : 'My workspace'
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
      await createWorkspace.execute({ ownerId: user.id, name: personalWorkspaceName(user.name) })
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
