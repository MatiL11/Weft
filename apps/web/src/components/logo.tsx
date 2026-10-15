interface LogoProps {
  className?: string
}

/** Wordmark: a magenta tile crossed by one thread, plus "weft". */
export function Logo({ className = '' }: LogoProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-fg ${className}`}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect width="20" height="20" rx="5" fill="var(--accent)" />
        <rect x="4" y="8.5" width="12" height="3" rx="1.5" fill="var(--bg)" />
      </svg>
      weft
    </span>
  )
}
