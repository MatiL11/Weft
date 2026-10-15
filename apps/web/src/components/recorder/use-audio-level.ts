'use client'

import { useEffect, useState } from 'react'

/** Live input level (0–1) of an audio stream, for a microphone meter. */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    const track = stream?.getAudioTracks()[0]
    if (!track) {
      setLevel(0)
      return
    }
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    const source = context.createMediaStreamSource(new MediaStream([track]))
    source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    let frame = 0

    const read = () => {
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) sum += sample * sample
      const rms = Math.sqrt(sum / samples.length)
      // Map roughly −50 dB…0 dB to 0…1.
      const db = 20 * Math.log10(Math.max(rms, 1e-5))
      setLevel(Math.min(1, Math.max(0, (db + 50) / 50)))
      frame = requestAnimationFrame(read)
    }
    read()

    return () => {
      cancelAnimationFrame(frame)
      source.disconnect()
      void context.close()
    }
  }, [stream])

  return level
}
