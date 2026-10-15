import { captureErrorCode, type CaptureErrorCode } from '../core/capture-errors'

export class CaptureError extends Error {
  constructor(
    readonly code: CaptureErrorCode,
    cause: unknown,
  ) {
    super(`Media capture failed: ${code}`, { cause })
    this.name = 'CaptureError'
  }
}

async function capture(request: () => Promise<MediaStream>): Promise<MediaStream> {
  try {
    return await request()
  } catch (error) {
    throw new CaptureError(captureErrorCode(error), error)
  }
}

export const RECORDING_FRAME_RATE = 30

/** Asks the user to pick a screen, window or tab. `withAudio` requests tab/system audio. */
export function requestScreen(options: { withAudio: boolean }): Promise<MediaStream> {
  return capture(() =>
    navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: RECORDING_FRAME_RATE, max: RECORDING_FRAME_RATE } },
      audio: options.withAudio,
      // Chromium-only hints; other browsers ignore unknown members.
      ...({
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include',
      } as object),
    }),
  )
}

export function requestCamera(deviceId?: string): Promise<MediaStream> {
  return capture(() =>
    navigator.mediaDevices.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: RECORDING_FRAME_RATE },
      },
    }),
  )
}

export function requestMicrophone(deviceId?: string): Promise<MediaStream> {
  return capture(() =>
    navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    }),
  )
}

export interface MediaDeviceOption {
  deviceId: string
  label: string
}

export interface AvailableDevices {
  cameras: MediaDeviceOption[]
  microphones: MediaDeviceOption[]
}

/** Lists cameras and microphones. Labels are empty until the user grants permission once. */
export async function listDevices(): Promise<AvailableDevices> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const pick = (kind: MediaDeviceKind) =>
    devices
      .filter((d) => d.kind === kind && d.deviceId !== '')
      .map((d) => ({ deviceId: d.deviceId, label: d.label }))
  return { cameras: pick('videoinput'), microphones: pick('audioinput') }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop())
}
