import type { InMemoryWorkspaceRepository } from '@weft/core/testing'
import { describe, expect, it } from 'vitest'
import { buildTestApp, NOW, postJson, sendJson } from '../test-app'

const json = async <T>(res: Response) => (await res.json()) as { data: T; error: { code: string } }

async function setup() {
  const ctx = buildTestApp()
  await ctx.workspaces.createWithMember(
    { id: 'ws_1', name: 'Acme', slug: 'acme', createdAt: NOW },
    'user_1',
    'owner',
  )
  return ctx
}

describe('member and invitation routes', () => {
  it('invites by link, shows the invitation and lets the invited account join', async () => {
    const ctx = await setup()
    const created = await ctx.app.request(
      '/api/workspaces/ws_1/invitations',
      postJson({ email: 'Beto@example.com', role: 'member' }),
    )
    expect(created.status).toBe(201)
    const { invitation, inviteUrl } = (
      await json<{ invitation: { email: string }; inviteUrl: string }>(created)
    ).data
    expect(invitation.email).toBe('beto@example.com')
    expect(inviteUrl).toBe('https://weft.test/invite/tok_1')

    ctx.actAs(null)
    const preview = await json<{
      workspace: { name: string }
      inviterName: string
      status: string
    }>(await ctx.app.request('/api/invitations/tok_1'))
    expect(preview.data).toMatchObject({
      workspace: { name: 'Acme' },
      inviterName: 'Ana',
      status: 'pending',
    })
    expect(
      (await ctx.app.request('/api/invitations/tok_1/accept', { method: 'POST' })).status,
    ).toBe(401)

    ctx.actAs({ id: 'user_1' })
    expect(
      (await ctx.app.request('/api/invitations/tok_1/accept', { method: 'POST' })).status,
    ).toBe(403)
    ctx.actAs({ id: 'user_2' })
    expect(
      (await ctx.app.request('/api/invitations/tok_1/accept', { method: 'POST' })).status,
    ).toBe(200)
    expect(
      (await ctx.app.request('/api/invitations/tok_1/accept', { method: 'POST' })).status,
    ).toBe(410)
    expect((await ctx.app.request('/api/invitations/nope')).status).toBe(404)

    const roster = await json<{
      role: string
      members: { name: string; role: string }[]
      invitations: unknown[]
    }>(await ctx.app.request('/api/workspaces/ws_1/members'))
    expect(roster.data).toMatchObject({ role: 'member', invitations: [] })
    expect(roster.data.members.map((m) => [m.name, m.role])).toEqual([
      ['Ana', 'owner'],
      ['Beto', 'member'],
    ])
  })

  it('manages roles, removals and revocations, refusing what the rules forbid', async () => {
    const ctx = await setup()
    await (ctx.workspaces as InMemoryWorkspaceRepository).addMember('ws_1', 'user_2', 'member')
    const created = await json<{ invitation: { id: string } }>(
      await ctx.app.request(
        '/api/workspaces/ws_1/invitations',
        postJson({ email: 'x@y.co', role: 'viewer' }),
      ),
    )
    expect(
      (
        await ctx.app.request(`/api/workspaces/ws_1/invitations/${created.data.invitation.id}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(200)

    expect(
      (
        await ctx.app.request(
          '/api/workspaces/ws_1/members/user_2',
          sendJson('PATCH', { role: 'admin' }),
        )
      ).status,
    ).toBe(200)
    expect(
      (await ctx.app.request('/api/workspaces/ws_1/members/user_2', sendJson('PATCH', {}))).status,
    ).toBe(400)
    expect(
      (await ctx.app.request('/api/workspaces/ws_1/invitations', postJson({ email: 1 }))).status,
    ).toBe(400)

    ctx.actAs({ id: 'user_2' })
    expect(
      (await ctx.app.request('/api/workspaces/ws_1/members/user_1', { method: 'DELETE' })).status,
    ).toBe(403)
    expect(
      (await ctx.app.request('/api/workspaces/ws_1/members/user_2', { method: 'DELETE' })).status,
    ).toBe(200)
    expect((await ctx.app.request('/api/workspaces/ws_1/members')).status).toBe(404)
  })
})
