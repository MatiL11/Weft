interface RecordingStageProps {
  elapsedLabel: string
}

/** Decorative illustration of a recording in progress: a captured window, camera bubble and REC timer. */
export function RecordingStage({ elapsedLabel }: RecordingStageProps) {
  return (
    <div aria-hidden="true" className="relative w-full max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-panel">
        <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 h-2 w-40 rounded-full bg-surface-sunken" />
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-4 p-5">
          <div className="space-y-2.5">
            <span className="block h-2 w-4/5 rounded-full bg-surface-sunken" />
            <span className="block h-2 w-3/5 rounded-full bg-surface-sunken" />
            <span className="block h-2 w-2/3 rounded-full bg-surface-sunken" />
            <span className="block h-2 w-1/2 rounded-full bg-surface-sunken" />
          </div>
          <div className="space-y-3">
            <span className="block h-24 rounded-lg bg-surface-sunken" />
            <span className="block h-2 w-full rounded-full bg-surface-sunken" />
            <span className="block h-2 w-5/6 rounded-full bg-surface-sunken" />
            <span className="block h-2 w-2/3 rounded-full bg-surface-sunken" />
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-6 grid size-28 place-items-center rounded-full border-4 border-bg bg-gradient-to-br from-line-strong to-surface-sunken shadow-panel">
        <svg viewBox="0 0 48 48" className="size-14 text-muted">
          <circle cx="24" cy="18" r="9" fill="currentColor" opacity="0.55" />
          <path d="M8 44c2-9 8.5-14 16-14s14 5 16 14" fill="currentColor" opacity="0.55" />
        </svg>
      </div>

      <div className="absolute -top-4 right-6 flex items-center gap-3 rounded-full bg-fg py-2 pr-4 pl-3 text-bg shadow-panel">
        <span className="pulse-dot size-2.5 rounded-full bg-accent" />
        <span className="font-mono text-sm tabular-nums tracking-wide">{elapsedLabel}</span>
      </div>
    </div>
  )
}
