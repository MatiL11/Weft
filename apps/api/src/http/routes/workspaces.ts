import type {
  AcceptInvitation,
  ChangeMemberRole,
  CreateWorkspace,
  GetInvitation,
  InviteMember,
  ListMembers,
  RemoveMember,
  RevokeInvitation,
  WorkspaceRepository,
} from '@weft/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { currentUser, requireUser, type AppEnv } from '../context'
import { fail, ok } from '../envelope'
import { invalid, parseJson } from '../validation'

const CreateWorkspaceBody = z.object({ name: z.string() })

export interface WorkspaceRouteDeps {
  workspaces: WorkspaceRepository
  createWorkspace: CreateWorkspace
  listMembers: ListMembers
  inviteMember: InviteMember
  revokeInvitation: RevokeInvitation
  changeMemberRole: ChangeMemberRole
  removeMember: RemoveMember
  getInvitation: GetInvitation
  acceptInvitation: AcceptInvitation
  publicUrl: string
}

const InviteBody = z.object({ email: z.string().max(320), role: z.string() })
const RoleBody = z.object({ role: z.string() })

const inviteUrl = (publicUrl: string, token: string) =>
  `${publicUrl.replace(/\/$/, '')}/invite/${token}`

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

  const userId = (c: { get: (key: 'user') => AppEnv['Variables']['user'] }) =>
    currentUser(c.get('user')).id

  routes.get('/:id/members', async (c) => {
    const roster = await deps.listMembers.execute({
      userId: userId(c),
      workspaceId: c.req.param('id'),
    })
    return c.json(
      ok({
        workspace: roster.workspace,
        role: roster.role,
        members: roster.members,
        invitations: roster.invitations.map(({ id, email, role, createdAt, expiresAt }) => ({
          id,
          email,
          role,
          createdAt,
          expiresAt,
        })),
      }),
    )
  })

  routes.post('/:id/invitations', async (c) => {
    const body = await parseJson(c, InviteBody)
    if (!body) return invalid(c)
    const { invitation, token } = await deps.inviteMember.execute({
      userId: userId(c),
      workspaceId: c.req.param('id'),
      ...body,
    })
    const { id, email, role, createdAt, expiresAt } = invitation
    return c.json(
      ok({
        invitation: { id, email, role, createdAt, expiresAt },
        inviteUrl: inviteUrl(deps.publicUrl, token),
      }),
      201,
    )
  })

  routes.delete('/:id/invitations/:invitationId', async (c) => {
    await deps.revokeInvitation.execute({
      userId: userId(c),
      workspaceId: c.req.param('id'),
      invitationId: c.req.param('invitationId'),
    })
    return c.json(ok({ revoked: true }))
  })

  routes.patch('/:id/members/:memberId', async (c) => {
    const body = await parseJson(c, RoleBody)
    if (!body) return invalid(c)
    await deps.changeMemberRole.execute({
      userId: userId(c),
      workspaceId: c.req.param('id'),
      memberId: c.req.param('memberId'),
      role: body.role,
    })
    return c.json(ok({ updated: true }))
  })

  routes.delete('/:id/members/:memberId', async (c) => {
    await deps.removeMember.execute({
      userId: userId(c),
      workspaceId: c.req.param('id'),
      memberId: c.req.param('memberId'),
    })
    return c.json(ok({ removed: true }))
  })

  return routes
}

/** Invite links: anyone holding one may see what it's for; accepting needs the right account. */
export function invitationRoutes(deps: WorkspaceRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.get('/:token', async (c) => {
    const details = await deps.getInvitation.execute({ token: c.req.param('token') })
    return c.json(
      ok({
        workspace: { id: details.workspace.id, name: details.workspace.name },
        email: details.invitation.email,
        role: details.invitation.role,
        inviterName: details.inviterName,
        status: details.status,
        expiresAt: details.invitation.expiresAt,
      }),
    )
  })

  routes.post('/:token/accept', requireUser, async (c) => {
    const workspace = await deps.acceptInvitation.execute({
      userId: currentUser(c.get('user')).id,
      token: c.req.param('token'),
    })
    return c.json(ok({ workspace }))
  })

  return routes
}
