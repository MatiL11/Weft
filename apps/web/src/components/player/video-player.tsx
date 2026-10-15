'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

interface VideoPlayerProps {
  /** Same-origin HLS playlist URL (the API redirects media requests to storage). */
  playlistUrl: string
  /** Live recordings start from the beginning instead of the live edge. */
  isLive: boolean
}

/**
 * HLS player: hls.js where Media Source Extensions exist, native HLS elsewhere (Safari/iOS).
 * hls.js is loaded on demand to keep it out of the initial bundle.
 */
export function VideoPlayer({ playlistUrl, isLive }: VideoPlayerProps) {
  const t = useTranslations('share')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasError, setHasError] = useState(false)

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
          if (data.fatal) setHasError(true)
        })
        hls.loadSource(playlistUrl)
        hls.attachMedia(video)
        destroy = () => hls.destroy()
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playlistUrl
      } else {
        setHasError(true)
      }
    })

    return () => {
      cancelled = true
      destroy()
    }
  }, [playlistUrl])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-[#111014]">
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full"
        data-live={isLive}
      />
      {hasError && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center text-white">
          <p role="alert">{t('playerError')}</p>
        </div>
      )}
    </div>
  )
}
