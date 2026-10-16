'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { PLAYBACK_RATES } from '@/lib/player-timeline'

interface SpeedMenuProps {
  rate: number
  onChange: (rate: number) => void
}

const formatRate = (rate: number) => `${rate}×`

/** Playback speed picker, 0.5× to 2.5×. */
export function SpeedMenu({ rate, onChange }: SpeedMenuProps) {
  const t = useTranslations('player')
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [isOpen])

  function choose(next: number) {
    onChange(next)
    setIsOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isOpen) {
          e.stopPropagation()
          setIsOpen(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('speed', { rate: formatRate(rate) })}
        title={t('speed', { rate: formatRate(rate) })}
        className={`h-9 min-w-12 cursor-pointer rounded-lg px-2 font-mono text-xs font-medium tabular-nums transition-colors hover:bg-white/15 ${
          rate === 1 ? 'text-white/90' : 'text-accent'
        }`}
      >
        {formatRate(rate)}
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label={t('speedMenu')}
          className="absolute right-0 bottom-full mb-2 grid min-w-24 gap-0.5 rounded-xl border border-white/10 bg-[#18161b]/95 p-1 shadow-xl backdrop-blur"
        >
          {[...PLAYBACK_RATES].reverse().map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === rate}
              onClick={() => choose(option)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left font-mono text-xs tabular-nums transition-colors hover:bg-white/10 aria-checked:text-accent"
            >
              {formatRate(option)}
              {option === rate && <span className="size-1.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
