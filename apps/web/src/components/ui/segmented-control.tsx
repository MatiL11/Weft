'use client'

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-line bg-surface-sunken p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className="h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-surface aria-checked:text-fg aria-checked:shadow-panel"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
