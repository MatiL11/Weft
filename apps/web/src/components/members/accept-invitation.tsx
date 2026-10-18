'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { acceptInvitation, VideoApiError } from '@/lib/video-api'

export function AcceptInvitationButton({ token }: { token: string }) {
  const t = useTranslations('invite')
  const router = useRouter()
  const [error, setError] = useState<'wrongAccount' | 'generic' | null>(null)
  const [isJoining, setIsJoining] = useState(false)

  async function accept() {
    setIsJoining(true)
    setError(null)
    try {
      const { workspace } = await acceptInvitation(token)
      router.push(`/?workspace=${encodeURIComponent(workspace.id)}`)
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof VideoApiError && caught.code === 'invitation.wrong_account'
          ? 'wrongAccount'
          : 'generic',
      )
      setIsJoining(false)
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => void accept()}
        disabled={isJoining}
        className="h-11 cursor-pointer rounded-xl bg-primary font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60"
      >
        {isJoining ? t('joining') : t('accept')}
      </button>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  )
}
