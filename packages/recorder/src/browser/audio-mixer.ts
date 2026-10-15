export interface MixedAudio {
  readonly track: MediaStreamTrack
  close(): Promise<void>
}

/**
 * Mixes several audio tracks (e.g. microphone + tab/system audio) into one track,
 * because the recording has a single audio track. Returns null when there is no audio.
 */
export function mixAudio(tracks: MediaStreamTrack[]): MixedAudio | null {
  const live = tracks.filter((t) => t.kind === 'audio' && t.readyState === 'live')
  if (live.length === 0) return null

  const context = new AudioContext({ sampleRate: 48_000 })
  const destination = context.createMediaStreamDestination()
  const sources = live.map((track) => {
    const source = context.createMediaStreamSource(new MediaStream([track]))
    source.connect(destination)
    return source
  })

  const [track] = destination.stream.getAudioTracks()
  if (!track) throw new Error('Audio mixer produced no track.')

  return {
    track,
    async close() {
      sources.forEach((s) => s.disconnect())
      track.stop()
      await context.close()
    },
  }
}
