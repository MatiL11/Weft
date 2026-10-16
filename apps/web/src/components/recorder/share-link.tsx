'use client'

import { useTranslations } from 'next-intl'
import { CopyField } from '../ui/copy-field'

interface ShareLinkProps {
  url: string
  hint?: string
}

/** The video's share URL with a copy button. */
export function ShareLink({ url, hint }: ShareLinkProps) {
  const t = useTranslations('recorder.share')
  return <CopyField id="share-link" label={t('label')} value={url} hint={hint} />
}
