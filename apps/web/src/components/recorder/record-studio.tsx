'use client'

import {
  CaptureError,
  exportRecording,
  findRecoverable,
  InMemorySegmentStore,
  isOpfsSupported,
  OpfsSegmentStore,
  Recorder,
  requestScreen,
  stopStream,
  UnsupportedBrowserError,
  type RecorderSnapshot,
  type RecordingManifest,
  type SegmentStore,
} from '@weft/recorder'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { recordingFilename } from '@/lib/recording-format'
import { COUNTDOWN_MS, modeUses, RECORDING_LIMIT_MINUTES } from '@/lib/recording-settings'
import { RecoveryBanner } from './recovery-banner'
import { ResultPanel, type FinishedVideo } from './result-panel'
import { SessionPanel } from './session-panel'
import { SetupPanel, type StartRequest } from './setup-panel'

type ErrorKey =
  | 'permission_denied'
  | 'device_not_found'
  | 'device_busy'
  | 'capture_failed'
  | 'encoding_failed'
  | 'storage_failed'
  | 'unsupported_browser'

type View =
  | { kind: 'setup' }
  | { kind: 'session'; recorder: Recorder }
  | { kind: 'result'; video: FinishedVideo }

interface BrowserSupport {
  canEncode: boolean
  canCaptureScreen: boolean
}

let storePromise: Promise<SegmentStore> | null = null
/** OPFS when available (survives crashes); otherwise memory, without recovery. */
function getStore(): Promise<SegmentStore> {
  storePromise ??= isOpfsSupported()
    ? OpfsSegmentStore.open().catch(() => new InMemorySegmentStore())
    : Promise.resolve(new InMemorySegmentStore())
  return storePromise
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function RecordStudio() {
  const t = useTranslations('recorder')
  const [support, setSupport] = useState<BrowserSupport | null>(null)
  const [view, setView] = useState<View>({ kind: 'setup' })
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [setupKey, setSetupKey] = useState(0)
  const [recoverable, setRecoverable] = useState<RecordingManifest[]>([])
  const completing = useRef(false)

  const refreshRecoverable = useCallback(async () => {
    const store = await getStore()
    setRecoverable(await findRecoverable(store))
  }, [])

  useEffect(() => {
    setSupport({
      canEncode: typeof VideoEncoder !== 'undefined',
      canCaptureScreen: typeof navigator.mediaDevices?.getDisplayMedia === 'function',
    })
    void refreshRecoverable()
  }, [refreshRecoverable])

  // Warn before leaving the page mid-recording (the browser shows its own dialog).
  const isRecording = view.kind === 'session'
  useEffect(() => {
    if (!isRecording) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isRecording])

  const backToSetup = useCallback(
    (nextError: ErrorKey | null = null) => {
      setError(nextError)
      setSetupKey((key) => key + 1)
      setView({ kind: 'setup' })
      void refreshRecoverable()
    },
    [refreshRecoverable],
  )

  const handleSnapshot = useCallback(
    async (recorder: Recorder, snapshot: RecorderSnapshot) => {
      if (snapshot.phase === 'failed') return backToSetup(snapshot.error ?? 'capture_failed')
      if (snapshot.phase !== 'finished' || completing.current) return
      completing.current = true
      const store = await getStore()
      const blob = await exportRecording(store, recorder.id)
      setView({
        kind: 'result',
        video: {
          url: URL.createObjectURL(blob),
          filename: recordingFilename(new Date()),
          durationMs: snapshot.elapsedMs,
          hitLimit: snapshot.stopReason === 'limit',
        },
      })
    },
    [backToSetup],
  )

  async function handleStart({ settings, camera, microphone }: StartRequest) {
    setError(null)
    setIsStarting(true)
    let screen: MediaStream | null = null
    try {
      // Must be the first await: the screen picker needs the click's user activation.
      if (modeUses(settings.mode).screen) {
        screen = await requestScreen({ withAudio: settings.systemAudio })
      }
      const recorder = await Recorder.start({
        store: await getStore(),
        sources: { screen, camera, microphone },
        bubble: { position: settings.bubblePosition, size: settings.bubbleSize },
        countdownMs: settings.countdown ? COUNTDOWN_MS : 0,
        limitMs: RECORDING_LIMIT_MINUTES * 60_000,
      })
      completing.current = false
      recorder.subscribe((snapshot) => void handleSnapshot(recorder, snapshot))
      setView({ kind: 'session', recorder })
    } catch (cause) {
      ;[screen, camera, microphone].forEach(stopStream)
      if (cause instanceof CaptureError) {
        // Closing the screen picker rejects with NotAllowedError in Chromium: not an error to show.
        const isPickerDismissed =
          cause.code === 'capture_cancelled' || cause.code === 'permission_denied'
        backToSetup(isPickerDismissed ? null : cause.code)
      } else if (cause instanceof UnsupportedBrowserError) backToSetup('unsupported_browser')
      else backToSetup('capture_failed')
    } finally {
      setIsStarting(false)
    }
  }

  async function handleDiscard(recorder: Recorder) {
    await recorder.cancel()
    backToSetup(null)
  }

  function handleRecordAgain(video: FinishedVideo) {
    URL.revokeObjectURL(video.url)
    backToSetup(null)
  }

  async function handleRecoverDownload(recording: RecordingManifest) {
    const store = await getStore()
    downloadBlob(
      await exportRecording(store, recording.id),
      recordingFilename(new Date(recording.createdAt)),
    )
  }

  async function handleRecoverDiscard(recording: RecordingManifest) {
    await (await getStore()).delete(recording.id)
    await refreshRecoverable()
  }

  if (!support) return null
  if (!support.canEncode) {
    return (
      <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
        {t('errors.unsupported_browser')}
      </p>
    )
  }

  if (view.kind === 'session') {
    return (
      <SessionPanel
        recorder={view.recorder}
        onStop={() => void view.recorder.stop().catch(() => undefined)}
        onDiscard={() => void handleDiscard(view.recorder)}
      />
    )
  }

  if (view.kind === 'result') {
    return <ResultPanel video={view.video} onRecordAgain={() => handleRecordAgain(view.video)} />
  }

  const [latestRecoverable] = recoverable
  return (
    <div className="grid gap-6">
      {latestRecoverable && (
        <RecoveryBanner
          recording={latestRecoverable}
          onDownload={() => void handleRecoverDownload(latestRecoverable)}
          onDiscard={() => void handleRecoverDiscard(latestRecoverable)}
        />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          {t(`errors.${error}`)}
        </p>
      )}
      <SetupPanel
        key={setupKey}
        canCaptureScreen={support.canCaptureScreen}
        isStarting={isStarting}
        onStart={(request) => void handleStart(request)}
      />
    </div>
  )
}
