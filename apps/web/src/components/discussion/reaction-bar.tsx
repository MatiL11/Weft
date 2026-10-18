'use client'

import { useTranslations } from 'next-intl'
import { REACTION_EMOJIS } from '@/lib/discussion'

interface ReactionBarProps {
  onReact: (emoji: string) => void
  disabled?: boolean
}

/** Emoji buttons that react at the current moment of the video. */
export function ReactionBar({ onReact, disabled = false }: ReactionBarProps) {
  const t = useTranslations('video.reactions')
  return (
    <div role="group" aria-label={t('label')} className="flex flex-wrap items-center gap-1">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          disabled={disabled}
          onClick={() => onReact(emoji)}
          aria-label={t('react', { emoji })}
          className="grid size-9 cursor-pointer place-items-center rounded-full border border-line bg-surface text-lg transition-transform duration-150 hover:-translate-y-0.5 hover:border-line-strong active:scale-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

/** Reactions floating up over the player as they arrive. */
export function ReactionBurst({ items }: { items: { id: string; emoji: string }[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {items.map((item) => (
        <span
          key={item.id}
          className="float-up absolute bottom-16 text-3xl"
          // Spread them out deterministically from their ids.
          style={{ left: `${10 + (hash(item.id) % 80)}%` }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  )
}

function hash(text: string): number {
  let value = 0
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0
  return value
}
