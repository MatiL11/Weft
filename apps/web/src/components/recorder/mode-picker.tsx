'use client'

import type { RecordingMode } from '@weft/recorder/core'

interface ModePickerProps {
  label: string
  value: RecordingMode
  options: { value: RecordingMode; label: string }[]
  onChange: (mode: RecordingMode) => void
  disabled?: boolean
}

/** Small diagram of each mode: a screen, a screen with the camera bubble, or the camera alone. */
function ModeGlyph({ mode }: { mode: RecordingMode }) {
  return (
    <svg viewBox="0 0 40 26" className="h-6 w-9" aria-hidden="true">
      {mode === 'camera' ? (
        <>
          <rect
            x="1"
            y="1"
            width="38"
            height="24"
            rx="4"
            className="fill-surface-sunken stroke-current"
            strokeWidth="1.5"
          />
          <circle cx="20" cy="11" r="4" className="fill-current" />
          <path d="M12 23c1.5-4.5 4.5-6.5 8-6.5s6.5 2 8 6.5" className="fill-current" />
        </>
      ) : (
        <>
          <rect
            x="1"
            y="1"
            width="38"
            height="24"
            rx="4"
            className="fill-surface-sunken stroke-current"
            strokeWidth="1.5"
          />
          <path
            d="M7 8h12M7 12h8M23 7h10v8H23z"
            className="stroke-current"
            strokeWidth="1.5"
            fill="none"
          />
          {mode === 'screen-camera' && (
            <circle cx="9" cy="19" r="5" className="fill-accent stroke-surface" strokeWidth="1.5" />
          )}
        </>
      )}
    </svg>
  )
}

export function ModePicker({ label, value, options, onChange, disabled = false }: ModePickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled && option.value !== 'camera'}
          onClick={() => onChange(option.value)}
          className="grid cursor-pointer justify-items-center gap-1.5 rounded-xl border border-line bg-surface px-2 pt-3 pb-2.5 text-center text-xs leading-tight font-medium text-muted transition-colors hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 aria-checked:border-accent aria-checked:bg-accent-soft aria-checked:text-fg"
        >
          <ModeGlyph mode={option.value} />
          {option.label}
        </button>
      ))}
    </div>
  )
}
