'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

interface SidePanelProps {
  commentCount: number
  comments: ReactNode
  /** Absent until the video has a transcript. */
  transcript: ReactNode | null
}

type Tab = 'comments' | 'transcript'

/** The column beside the player: comments and, when available, the transcript. */
export function SidePanel({ commentCount, comments, transcript }: SidePanelProps) {
  const t = useTranslations('video')
  const [tab, setTab] = useState<Tab>('comments')
  const active: Tab = transcript ? tab : 'comments'
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'comments', label: t('comments.title'), count: commentCount },
    ...(transcript ? [{ id: 'transcript' as const, label: t('transcript.title') }] : []),
  ]

  return (
    <section className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div
        role="tablist"
        aria-label={t('panel')}
        className="flex gap-1 border-b border-line px-2 pt-2"
      >
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={active === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className="-mb-px cursor-pointer border-b-2 border-transparent px-3 pt-1.5 pb-2.5 text-sm font-medium text-muted transition-colors hover:text-fg aria-selected:border-accent aria-selected:text-fg"
          >
            {label}
            {count ? (
              <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 py-px font-mono text-xs tabular-nums">
                {count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {active === 'comments' ? comments : transcript}
      </div>
    </section>
  )
}
