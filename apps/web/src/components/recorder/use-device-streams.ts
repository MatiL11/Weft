'use client'

import {
  CaptureError,
  listDevices,
  requestCamera,
  requestMicrophone,
  stopStream,
  type AvailableDevices,
  type CaptureErrorCode,
} from '@weft/recorder'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface DeviceStreamsState {
  camera: MediaStream | null
  microphone: MediaStream | null
  devices: AvailableDevices
  error: CaptureErrorCode | null
}

interface UseDeviceStreamsOptions {
  wantsCamera: boolean
  cameraId: string | null
  microphoneId: string | null
}

const NO_DEVICES: AvailableDevices = { cameras: [], microphones: [] }

const toErrorCode = (error: unknown): CaptureErrorCode =>
  error instanceof CaptureError ? error.code : 'capture_failed'

/**
 * Opens the selected camera and microphone for preview while the user sets up a recording.
 * `take()` hands the live streams to the recorder; after that this hook no longer stops them.
 */
export function useDeviceStreams({ wantsCamera, cameraId, microphoneId }: UseDeviceStreamsOptions) {
  const [state, setState] = useState<DeviceStreamsState>({
    camera: null,
    microphone: null,
    devices: NO_DEVICES,
    error: null,
  })
  const owned = useRef<{ camera: MediaStream | null; microphone: MediaStream | null }>({
    camera: null,
    microphone: null,
  })

  useEffect(() => {
    if (!wantsCamera) return
    let cancelled = false
    requestCamera(cameraId ?? undefined)
      .then(async (stream) => {
        if (cancelled) return stopStream(stream)
        owned.current.camera = stream
        const devices = await listDevices()
        setState((s) => ({ ...s, camera: stream, devices, error: null }))
      })
      .catch(
        (error: unknown) => !cancelled && setState((s) => ({ ...s, error: toErrorCode(error) })),
      )
    return () => {
      cancelled = true
      stopStream(owned.current.camera)
      owned.current.camera = null
      setState((s) => ({ ...s, camera: null }))
    }
  }, [wantsCamera, cameraId])

  useEffect(() => {
    if (microphoneId === 'none') return
    let cancelled = false
    requestMicrophone(microphoneId ?? undefined)
      .then(async (stream) => {
        if (cancelled) return stopStream(stream)
        owned.current.microphone = stream
        const devices = await listDevices()
        setState((s) => ({ ...s, microphone: stream, devices, error: null }))
      })
      .catch(
        (error: unknown) => !cancelled && setState((s) => ({ ...s, error: toErrorCode(error) })),
      )
    return () => {
      cancelled = true
      stopStream(owned.current.microphone)
      owned.current.microphone = null
      setState((s) => ({ ...s, microphone: null }))
    }
  }, [microphoneId])

  const take = useCallback(() => {
    const streams = { ...owned.current }
    owned.current = { camera: null, microphone: null }
    return streams
  }, [])

  return { ...state, take }
}
