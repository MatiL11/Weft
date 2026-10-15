/**
 * Fixed-rate ticker driven by a dedicated worker. Main-thread timers and
 * requestAnimationFrame are throttled or paused when the tab is in the background,
 * which is exactly when the user is recording another window; worker timers keep pace.
 */
export interface Ticker {
  stop(): void
}

const WORKER_SOURCE = `
let id = null
onmessage = (event) => {
  if (event.data.type === 'start') {
    clearInterval(id)
    id = setInterval(() => postMessage(0), event.data.intervalMs)
  } else {
    clearInterval(id)
    id = null
  }
}
`

export function startTicker(fps: number, onTick: () => void): Ticker {
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
  const worker = new Worker(url)
  URL.revokeObjectURL(url)
  worker.onmessage = () => onTick()
  worker.postMessage({ type: 'start', intervalMs: 1000 / fps })

  return {
    stop() {
      worker.postMessage({ type: 'stop' })
      worker.terminate()
    },
  }
}
