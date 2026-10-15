import type { CreateWorkspace, WorkspaceRepository } from '@weft/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { currentUser, requireUser, type AppEnv } from '../context'
import { fail, ok } from '../envelope'

const CreateWorkspaceBody = z.object({ name: z.string() })

export interface WorkspaceRouteDeps {
  workspaces: WorkspaceRepository
  createWorkspace: CreateWorkspace
}

export function workspaceRoutes(deps: WorkspaceRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  routes.use(requireUser)

  routes.get('/', async (c) => {
    const memberships = await deps.workspaces.listForUser(currentUser(c.get('user')).id)
    return c.json(ok(memberships))
  })

  routes.post('/', async (c) => {
    const parsed = CreateWorkspaceBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json(fail('validation_error', 'Body must be { name: string }.'), 400)
    }
    const workspace = await deps.createWorkspace.execute({
      ownerId: currentUser(c.get('user')).id,
      name: parsed.data.name,
    })
    return c.json(ok(workspace), 201)
  })

  return routes
}
