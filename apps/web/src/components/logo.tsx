/** Wordmark: three warp threads crossed by one weft thread. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-2xl tracking-tight ${className}`}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 2v18M11 2v18M17 2v18" opacity="0.35" />
        </g>
        <path d="M2 11h18" stroke="var(--color-thread)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      weft
    </span>
  )
}
