'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { formatClock } from '@/lib/player-timeline'
import {
  activeSegmentIndex,
  highlightParts,
  searchSegments,
  type TranscriptView,
} from '@/lib/transcript'

interface TranscriptPanelProps {
  transcript: TranscriptView
  /** Playback position, in ms on the transcript's timeline. */
  currentMs: number
  onSeek: (ms: number) => void
  vttUrl: string
}

/** After the viewer scrolls the list, it stops following playback for a moment. */
const MANUAL_SCROLL_GRACE_MS = 4000

export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/** The transcript next to the player: follows playback, searchable, click a line to jump. */
export function TranscriptPanel({ transcript, currentMs, onSeek, vttUrl }: TranscriptPanelProps) {
  const t = useTranslations('video.transcript')
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const lastManualScroll = useRef(0)

  const { segments } = transcript
  const active = activeSegmentIndex(segments, currentMs)
  const matches = searchSegments(segments, query)
  const isSearching = query.trim().length > 0
  const visible = isSearching ? matches : segments.map((_, i) => i)

  // Keep the line being spoken in view, unless the viewer is reading elsewhere.
  useEffect(() => {
    const list = listRef.current
    if (!list || active < 0 || isSearching) return
    if (Date.now() - lastManualScroll.current < MANUAL_SCROLL_GRACE_MS) return
    const row = list.querySelector<HTMLElement>(`[data-index="${active}"]`)
    if (!row) return
    const top = row.offsetTop - list.clientHeight / 3
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [active, isSearching])

  return (
    <section
      aria-labelledby="transcript-title"
      className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div className="grid gap-3 border-b border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="transcript-title" className="font-semibold tracking-tight">
            {t('title')}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="rounded-md bg-surface-sunken px-1.5 py-0.5">
              {languageName(transcript.language, locale)}
            </span>
            <a href={vttUrl} download className="font-medium underline-offset-4 hover:underline">
              .vtt
            </a>
          </div>
        </div>
        <div className="relative">
          <label htmlFor="transcript-search" className="sr-only">
            {t('search')}
          </label>
          <input
            id="transcript-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={t('search')}
            className="h-9 w-full rounded-xl border border-line bg-surface-sunken px-3 text-sm"
          />
          {isSearching && (
            <p role="status" className="mt-1.5 text-xs text-muted">
              {t('matches', { count: matches.length })}
            </p>
          )}
        </div>
      </div>

      <ol
        ref={listRef}
        onWheel={() => (lastManualScroll.current = Date.now())}
        onTouchMove={() => (lastManualScroll.current = Date.now())}
        className="relative min-h-0 flex-1 overflow-y-auto p-2"
      >
        {segments.length === 0 && <li className="p-3 text-sm text-muted">{t('empty')}</li>}
        {visible.map((index) => {
          const segment = segments[index]
          if (!segment) return null
          const isActive = index === active
          return (
            <li key={index} data-index={index}>
              <button
                type="button"
                onClick={() => onSeek(segment.startMs)}
                aria-current={isActive ? 'true' : undefined}
                className={`grid w-full cursor-pointer grid-cols-[3.25rem_1fr] gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-sunken ${
                  isActive ? 'bg-accent-soft text-fg' : 'text-muted'
                }`}
              >
                <span
                  className={`pt-px font-mono text-xs tabular-nums ${isActive ? 'text-accent' : ''}`}
                >
                  {formatClock(segment.startMs / 1000)}
                </span>
                <span className={isActive ? 'text-fg' : 'text-fg/80'}>
                  {highlightParts(segment.text, query).map((part, i) =>
                    part.match ? (
                      <mark key={i} className="rounded-sm bg-accent/25 text-fg">
                        {part.text}
                      </mark>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
