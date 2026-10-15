'use client'

import {
  CaptureError,
  exportRecording,
  fetchTransport,
  findRecoverable,
  InMemorySegmentStore,
  isOpfsSupported,
  OpfsSegmentStore,
  Recorder,
  requestScreen,
  sha256Base64,
  stopStream,
  UnsupportedBrowserError,
  UploadQueue,
  type RecorderSnapshot,
  type RecordingManifest,
  type SegmentStore,
} from '@weft/recorder'
import { useFormatter, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { recordingFilename } from '@/lib/recording-format'
import { COUNTDOWN_MS, modeUses, RECORDING_LIMIT_MINUTES } from '@/lib/recording-settings'
import { createUploadApi, deleteVideo, startVideo } from '@/lib/video-api'
import { RecoveryBanner } from './recovery-banner'
import { ResultPanel, type FinishedVideo, type ShareStatus } from './result-panel'
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

/** Server-side copy of a recording: its share link and the uploads feeding it. */
export interface UploadSession {
  videoId: string
  shareUrl: string
  queue: UploadQueue
}

type View =
  | { kind: 'setup' }
  | { kind: 'session'; recorder: Recorder; upload: UploadSession | null }
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

/** Creates the server video (and link) for a new recording; null when the API is unreachable. */
async function openUploadSession(title: string): Promise<UploadSession | null> {
  try {
    const started = await startVideo(title)
    return {
      videoId: started.id,
      shareUrl: started.shareUrl,
      queue: new UploadQueue({
        api: createUploadApi(started.id),
        transport: fetchTransport,
        sha256: sha256Base64,
      }),
    }
  } catch {
    return null
  }
}

function discardServerCopy(upload: UploadSession | null): void {
  if (!upload) return
  upload.queue.cancel()
  void deleteVideo(upload.videoId).catch(() => undefined)
}

export function RecordStudio() {
  const t = useTranslations('recorder')
  const format = useFormatter()
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

  const setShareStatus = useCallback((status: ShareStatus) => {
    setView((current) =>
      current.kind === 'result' && current.video.share
        ? { ...current, video: { ...current.video, share: { ...current.video.share, status } } }
        : current,
    )
  }, [])

  const handleSnapshot = useCallback(
    async (recorder: Recorder, upload: UploadSession | null, snapshot: RecorderSnapshot) => {
      if (snapshot.phase === 'failed') {
        // The local copy stays recoverable; a half-uploaded link would only confuse viewers.
        discardServerCopy(upload)
        return backToSetup(snapshot.error ?? 'capture_failed')
      }
      if (snapshot.phase !== 'finished' || completing.current) return
      completing.current = true

      const finished = await recorder.stop()
      const blob = await exportRecording(await getStore(), recorder.id)
      setView({
        kind: 'result',
        video: {
          url: URL.createObjectURL(blob),
          filename: recordingFilename(new Date()),
          durationMs: finished.durationMs,
          hitLimit: snapshot.stopReason === 'limit',
          share: upload ? { url: upload.shareUrl, status: 'uploading' } : null,
        },
      })
      if (!upload) return

      try {
        await upload.queue.finish({
          durationMs: finished.durationMs,
          segmentCount: finished.segmentCount,
        })
        setShareStatus('ready')
        await navigator.clipboard.writeText(upload.shareUrl).catch(() => undefined)
      } catch {
        setShareStatus('failed')
      }
    },
    [backToSetup, setShareStatus],
  )

  async function handleStart({ settings, camera, microphone }: StartRequest) {
    setError(null)
    setIsStarting(true)
    let screen: MediaStream | null = null
    let upload: UploadSession | null = null
    try {
      // Must be the first await: the screen picker needs the click's user activation.
      if (modeUses(settings.mode).screen) {
        screen = await requestScreen({ withAudio: settings.systemAudio })
      }
      const title = t('defaultTitle', {
        date: format.dateTime(new Date(), { dateStyle: 'medium', timeStyle: 'short' }),
      })
      upload = await openUploadSession(title)
      const store = await getStore()
      const localId = crypto.randomUUID()
      const session = upload
      const recorder = await Recorder.start({
        store,
        sources: { screen, camera, microphone },
        bubble: { position: settings.bubblePosition, size: settings.bubbleSize },
        countdownMs: settings.countdown ? COUNTDOWN_MS : 0,
        limitMs: RECORDING_LIMIT_MINUTES * 60_000,
        createId: () => localId,
        onSegmentStored: session
          ? (segment) => {
              try {
                session.queue.enqueue({
                  ...segment,
                  load: () => store.readSegment(localId, segment.kind, segment.index),
                })
              } catch {
                // The queue was cancelled (recording discarded); late segments are ignored.
              }
            }
          : undefined,
      })
      completing.current = false
      recorder.subscribe((snapshot) => void handleSnapshot(recorder, session, snapshot))
      setView({ kind: 'session', recorder, upload: session })
    } catch (cause) {
      ;[screen, camera, microphone].forEach(stopStream)
      discardServerCopy(upload)
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

  async function handleDiscard(recorder: Recorder, upload: UploadSession | null) {
    discardServerCopy(upload)
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
        upload={view.upload}
        onStop={() => void view.recorder.stop().catch(() => undefined)}
        onDiscard={() => void handleDiscard(view.recorder, view.upload)}
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
