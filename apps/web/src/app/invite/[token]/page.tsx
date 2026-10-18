import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { AuthShell } from '@/components/auth-shell'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { AcceptInvitationButton } from '@/components/members/accept-invitation'
import { fetchAs, fetchSessionUserId, type InvitationPreview } from '@/lib/members'

export const dynamic = 'force-dynamic'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'
/** Invite tokens are base64url; anything else is rejected before reaching the API. */
const TOKEN = /^[A-Za-z0-9_-]{8,128}$/

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getTranslations('invite'))('title'),
    robots: { index: false, follow: false },
  }
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cookieHeader = (await cookies()).toString()
  const t = await getTranslations('invite')
  const [preview, userId] = await Promise.all([
    TOKEN.test(token)
      ? fetchAs<InvitationPreview>(`${API_INTERNAL_URL}/api/invitations/${token}`, cookieHeader)
      : Promise.resolve({ kind: 'not_found' as const }),
    fetchSessionUserId(API_INTERNAL_URL, cookieHeader),
  ])
  const here = `/invite/${token}`
  const roles = await getTranslations('members.roles')

  return (
    <AuthShell headline={t('headline')} tagline={t('tagline')} toolbar={<LocaleSwitcher />}>
      <div className="rise grid w-full max-w-sm gap-5">
        {preview.kind !== 'ok' ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
            <p className="text-muted">{t('notFoundBody')}</p>
          </>
        ) : preview.data.status !== 'pending' ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t(`closed.${preview.data.status}`)}
            </h1>
            <p className="text-muted">{t('closedBody')}</p>
          </>
        ) : (
          <>
            <div className="grid gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t('join', { workspace: preview.data.workspace.name })}
              </h1>
              <p className="text-muted">
                {t('invitedBy', {
                  name: preview.data.inviterName || t('someone'),
                  role: roles(preview.data.role),
                  email: preview.data.email,
                })}
              </p>
            </div>
            {userId ? (
              <AcceptInvitationButton token={token} />
            ) : (
              <div className="grid gap-2">
                <Link
                  href={`/sign-up?next=${encodeURIComponent(here)}`}
                  className="flex h-11 items-center justify-center rounded-xl bg-primary font-medium text-on-primary hover:bg-primary-hover"
                >
                  {t('signUp')}
                </Link>
                <Link
                  href={`/sign-in?next=${encodeURIComponent(here)}`}
                  className="flex h-11 items-center justify-center rounded-xl border border-line font-medium hover:border-line-strong"
                >
                  {t('signIn')}
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </AuthShell>
  )
}
