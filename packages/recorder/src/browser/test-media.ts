/** Synthetic media sources for browser tests (no real devices or permission prompts). */

export interface FakeScreen {
  stream: MediaStream
  stop(): void
}

/** An animated 1280×720 canvas captured as a "screen" video track. */
export function fakeScreen(width = 1280, height = 720): FakeScreen {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context')
  let frame = 0
  const timer = setInterval(() => {
    frame += 1
    ctx.fillStyle = `hsl(${(frame * 7) % 360} 60% 50%)`
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#fff'
    ctx.font = '64px sans-serif'
    ctx.fillText(String(frame), 40, 100)
  }, 1000 / 30)
  const stream = canvas.captureStream(30)
  return {
    stream,
    stop() {
      clearInterval(timer)
      stream.getTracks().forEach((t) => t.stop())
    },
  }
}

/** A 440 Hz tone as a "microphone" track. */
export function fakeMicrophone(): MediaStream {
  const context = new AudioContext()
  const oscillator = context.createOscillator()
  const destination = context.createMediaStreamDestination()
  oscillator.frequency.value = 440
  oscillator.connect(destination)
  oscillator.start()
  return destination.stream
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
