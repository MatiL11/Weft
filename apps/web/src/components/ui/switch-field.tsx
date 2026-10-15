'use client'

interface SwitchFieldProps {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function SwitchField({ id, label, hint, checked, onChange, disabled }: SwitchFieldProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="group relative mt-0.5 h-6 w-10 shrink-0 cursor-pointer rounded-full bg-line-strong transition-colors aria-checked:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-panel transition-transform duration-200 group-aria-checked:translate-x-4" />
      </button>
    </div>
  )
}
