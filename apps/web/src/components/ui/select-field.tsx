'use client'

import type { ReactNode } from 'react'

interface SelectFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  disabled?: boolean
  trailing?: ReactNode
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  disabled,
  trailing,
}: SelectFieldProps) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {trailing}
      </div>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full cursor-pointer truncate rounded-xl border border-line bg-surface px-3 text-sm text-fg transition-colors hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </div>
  )
}
