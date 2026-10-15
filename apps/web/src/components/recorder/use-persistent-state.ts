'use client'

import { useEffect, useState } from 'react'

/**
 * useState that remembers its value in localStorage (a per-browser convenience).
 * Storage can be unavailable (private mode, blocked site data); the hook then behaves like useState.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  isValid: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(initial)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return
      const parsed: unknown = JSON.parse(raw)
      if (isValid(parsed)) setValue(parsed)
    } catch {
      // Ignore unreadable or unavailable storage.
    }
  }, [key, isValid])

  const update = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Ignore quota or availability errors; the in-memory value still applies.
    }
  }

  return [value, update] as const
}
