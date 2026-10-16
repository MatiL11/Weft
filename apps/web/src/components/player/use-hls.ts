'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * Attaches an HLS playlist to a <video>: hls.js where Media Source Extensions exist, native
 * HLS elsewhere (Safari/iOS). hls.js is loaded on demand to keep it out of the initial bundle.
 */
export function useHls(
  videoRef: RefObject<HTMLVideoElement | null>,
  playlistUrl: string,
  onFatalError: () => void,
) {
  const onFatal = useRef(onFatalError)
  onFatal.current = onFatalError

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let destroy = () => {}
    let cancelled = false

    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return
      if (Hls.isSupported()) {
        const hls = new Hls({ startPosition: 0 })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) onFatal.current()
        })
        hls.loadSource(playlistUrl)
        hls.attachMedia(video)
        destroy = () => hls.destroy()
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playlistUrl
        destroy = () => {
          video.removeAttribute('src')
          video.load()
        }
      } else {
        onFatal.current()
      }
    })

    return () => {
      cancelled = true
      destroy()
    }
  }, [playlistUrl, videoRef])
}
