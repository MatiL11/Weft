'use client'

import { canChangeRole, canInvite, canManageMembers, canRemove, INVITABLE_ROLES } from '@weft/core'
import { useFormatter, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import type { InvitableRole, Roster } from '@/lib/members'
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  revokeInvitation,
  VideoApiError,
} from '@/lib/video-api'
import { CopyField } from '../ui/copy-field'

/** Members, their roles and invitations of one workspace. */
export function MembersManager({ roster, viewerId }: { roster: Roster; viewerId: string }) {
  const t = useTranslations('members')
  const router = useRouter()
  const format = useFormatter()
  const [error, setError] = useState<string | null>(null)
  const workspaceId = roster.workspace.id
  const isManager = canManageMembers(roster.role)
  const roleLabel = (role: string) => t(`roles.${role as 'owner'}`)

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      router.refresh()
    } catch (caught) {
      setError(caught instanceof VideoApiError ? caught.code : 'generic')
    }
  }

  return (
    <div className="grid gap-8">
      {isManager && (
        <InviteForm
          workspaceId={workspaceId}
          role={roster.role}
          onInvited={() => router.refresh()}
        />
      )}

      <section aria-labelledby="members-title" className="grid gap-3">
        <h2 id="members-title" className="font-semibold tracking-tight">
          {t('membersTitle', { count: roster.members.length })}
        </h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {roster.members.map((member) => {
            const isSelf = member.userId === viewerId
            const changeable = INVITABLE_ROLES.filter((role) =>
              canChangeRole(roster.role, member.role, role),
            )
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
              >
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-medium">
                    {member.name}{' '}
                    {isSelf && <span className="text-sm font-normal text-muted">({t('you')})</span>}
                  </span>
                  <span className="truncate text-sm text-muted">{member.email}</span>
                </div>
                {changeable.length > 0 && !isSelf ? (
                  <select
                    aria-label={t('roleOf', { name: member.name })}
                    value={member.role}
                    onChange={(e) => {
                      const role = e.currentTarget.value
                      void run(() => changeMemberRole(workspaceId, member.userId, role))
                    }}
                    className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-2 text-sm"
                  >
                    {!changeable.includes(member.role as InvitableRole) && (
                      <option value={member.role}>{roleLabel(member.role)}</option>
                    )}
                    {changeable.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-md bg-surface-sunken px-2 py-1 text-xs">
                    {roleLabel(member.role)}
                  </span>
                )}
                {isSelf && member.role !== 'owner' ? (
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await removeMember(workspaceId, member.userId)
                        router.push('/')
                      })
                    }
                    className="h-9 cursor-pointer rounded-lg px-3 text-sm text-danger hover:bg-danger-soft"
                  >
                    {t('leave')}
                  </button>
                ) : (
                  !isSelf &&
                  canRemove(roster.role, member.role) && (
                    <button
                      type="button"
                      onClick={() => void run(() => removeMember(workspaceId, member.userId))}
                      className="h-9 cursor-pointer rounded-lg px-3 text-sm text-danger hover:bg-danger-soft"
                    >
                      {t('remove')}
                    </button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {isManager && roster.invitations.length > 0 && (
        <section aria-labelledby="invitations-title" className="grid gap-3">
          <h2 id="invitations-title" className="font-semibold tracking-tight">
            {t('pendingTitle')}
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {roster.invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
              >
                <span className="min-w-0 flex-1 truncate">{invitation.email}</span>
                <span className="text-sm text-muted">
                  {roleLabel(invitation.role)} ·{' '}
                  {t('expires', {
                    date: format.dateTime(new Date(invitation.expiresAt), { dateStyle: 'medium' }),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => void run(() => revokeInvitation(workspaceId, invitation.id))}
                  className="h-8 cursor-pointer rounded-lg px-3 text-sm text-muted hover:text-danger"
                >
                  {t('revoke')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          {t(`errors.${errorMessage(error)}`)}
        </p>
      )}
    </div>
  )
}

const KNOWN_ERRORS = [
  'workspace.forbidden',
  'invitation.email_invalid',
  'invitation.already_member',
] as const
type ErrorMessage = 'forbidden' | 'emailInvalid' | 'alreadyMember' | 'generic'

function errorMessage(code: string): ErrorMessage {
  const index = (KNOWN_ERRORS as readonly string[]).indexOf(code)
  return (['forbidden', 'emailInvalid', 'alreadyMember'] as const)[index] ?? 'generic'
}

function InviteForm({
  workspaceId,
  role: actor,
  onInvited,
}: {
  workspaceId: string
  role: Roster['role']
  onInvited: () => void
}) {
  const t = useTranslations('members')
  const roles = INVITABLE_ROLES.filter((role) => canInvite(actor, role))
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitableRole>('member')
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<ErrorMessage | null>(null)
  const [isSending, setIsSending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setIsSending(true)
    setError(null)
    try {
      const { inviteUrl } = await inviteMember(workspaceId, email, role)
      setLink(inviteUrl)
      setEmail('')
      onInvited()
    } catch (caught) {
      setError(errorMessage(caught instanceof VideoApiError ? caught.code : ''))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section
      aria-labelledby="invite-title"
      className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="grid gap-0.5">
        <h2 id="invite-title" className="font-semibold tracking-tight">
          {t('inviteTitle')}
        </h2>
        <p className="text-sm text-muted">{t('inviteHint')}</p>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-56 flex-1 gap-1.5">
          <label htmlFor="invite-email" className="text-sm font-medium">
            {t('email')}
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            className="h-10 rounded-xl border border-line bg-surface px-3 text-sm"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium">
            {t('role')}
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.currentTarget.value as InvitableRole)}
            className="h-10 cursor-pointer rounded-xl border border-line bg-surface px-3 text-sm"
          >
            {roles.map((option) => (
              <option key={option} value={option}>
                {t(`roles.${option}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={isSending}
          className="h-10 cursor-pointer rounded-xl bg-primary px-4 text-sm font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60"
        >
          {t('invite')}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
      {link && (
        <CopyField
          id="invite-link"
          label={t('linkLabel')}
          value={link}
          hint={t('linkHint')}
          copyLabel={t('copyLink')}
        />
      )}
    </section>
  )
}
