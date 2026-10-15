const pad = (value: number) => String(value).padStart(2, '0')

/** Formats a duration as mm:ss, or h:mm:ss from one hour on. */
export function formatDuration(ms: number): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** File name for a downloaded recording, e.g. weft-2026-10-05-0907.mp4 (local time). */
export function recordingFilename(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `weft-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.mp4`
}
