'use client'

import { useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectField } from '@/components/ui/select-field'
import { SwitchField } from '@/components/ui/switch-field'
import {
  BUBBLE_POSITIONS,
  BUBBLE_SIZES,
  DEFAULT_SETTINGS,
  isRecordingSettings,
  MODES,
  modeUses,
  RECORDING_LIMIT_MINUTES,
  type RecordingSettings,
} from '@/lib/recording-settings'
import { ModePicker } from './mode-picker'
import { PreviewStage } from './preview-stage'
import { useAudioLevel } from './use-audio-level'
import { useDeviceStreams } from './use-device-streams'
import { usePersistentState } from './use-persistent-state'

export interface StartRequest {
  settings: RecordingSettings
  camera: MediaStream | null
  microphone: MediaStream | null
}

interface SetupPanelProps {
  canCaptureScreen: boolean
  isStarting: boolean
  onStart: (request: StartRequest) => void
}

const SETTINGS_KEY = 'weft.recording-settings'

export function SetupPanel({ canCaptureScreen, isStarting, onStart }: SetupPanelProps) {
  const t = useTranslations('recorder')
  const isValid = useCallback(isRecordingSettings, [])
  const [stored, setSettings] = usePersistentState(SETTINGS_KEY, DEFAULT_SETTINGS, isValid)
  const settings: RecordingSettings = canCaptureScreen ? stored : { ...stored, mode: 'camera' }
  const uses = modeUses(settings.mode)

  const streams = useDeviceStreams({
    wantsCamera: uses.camera,
    cameraId: settings.cameraId,
    microphoneId: settings.microphoneId,
  })
  const level = useAudioLevel(streams.microphone)
  const update = (patch: Partial<RecordingSettings>) => setSettings({ ...stored, ...patch })

  function handleStart() {
    const { camera, microphone } = streams.take()
    onStart({ settings, camera: uses.camera ? camera : null, microphone })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="grid gap-3">
        <PreviewStage
          mode={settings.mode}
          camera={streams.camera}
          bubble={{ position: settings.bubblePosition, size: settings.bubbleSize }}
          cameraPlaceholder={t('cameraPreviewOff')}
        />
        <p className="text-sm text-muted">
          {uses.screen ? t('shareHint') : t('limitHint', { minutes: RECORDING_LIMIT_MINUTES })}
        </p>
      </div>

      <aside className="grid gap-6 rounded-2xl border border-line bg-surface p-5">
        <div className="grid gap-2">
          <span className="text-sm font-medium">{t('modes.label')}</span>
          <ModePicker
            label={t('modes.label')}
            value={settings.mode}
            onChange={(mode) => update({ mode })}
            disabled={!canCaptureScreen}
            options={MODES.map((mode) => ({ value: mode, label: t(`modes.${mode}`) }))}
          />
          {!canCaptureScreen && (
            <p className="text-xs text-muted">{t('errors.no_screen_capture')}</p>
          )}
        </div>

        {uses.camera && (
          <SelectField
            id="camera-select"
            label={t('camera.label')}
            value={
              settings.cameraId ?? streams.camera?.getVideoTracks()[0]?.getSettings().deviceId ?? ''
            }
            onChange={(cameraId) => update({ cameraId })}
            disabled={streams.devices.cameras.length === 0}
          >
            {streams.devices.cameras.length === 0 && (
              <option value="">{t('camera.unavailable')}</option>
            )}
            {streams.devices.cameras.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `${t('camera.label')} ${i + 1}`}
              </option>
            ))}
          </SelectField>
        )}

        <SelectField
          id="microphone-select"
          label={t('microphone.label')}
          value={
            settings.microphoneId ??
            streams.microphone?.getAudioTracks()[0]?.getSettings().deviceId ??
            ''
          }
          onChange={(microphoneId) => update({ microphoneId })}
          trailing={
            <span
              role="meter"
              aria-label={t('microphone.level')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
              className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken"
            >
              <span
                className="block h-full origin-left rounded-full bg-accent transition-transform duration-75"
                style={{ transform: `scaleX(${level})` }}
              />
            </span>
          }
        >
          {streams.devices.microphones.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `${t('microphone.label')} ${i + 1}`}
            </option>
          ))}
          <option value="none">{t('microphone.none')}</option>
        </SelectField>

        {uses.screen && (
          <SwitchField
            id="system-audio"
            label={t('systemAudio')}
            hint={t('systemAudioHint')}
            checked={settings.systemAudio}
            onChange={(systemAudio) => update({ systemAudio })}
          />
        )}

        {settings.mode === 'screen-camera' && (
          <div className="grid gap-3">
            <span className="text-sm font-medium">{t('bubble.label')}</span>
            <div className="grid grid-cols-[auto_1fr] items-center gap-3">
              <div
                role="radiogroup"
                aria-label={t('bubble.positionLabel')}
                className="grid grid-cols-2 gap-1"
              >
                {BUBBLE_POSITIONS.map((position) => (
                  <button
                    key={position}
                    type="button"
                    role="radio"
                    aria-checked={settings.bubblePosition === position}
                    aria-label={t(`bubble.position.${position}`)}
                    title={t(`bubble.position.${position}`)}
                    onClick={() => update({ bubblePosition: position })}
                    className="group relative size-9 cursor-pointer rounded-lg border border-line bg-surface-sunken transition-colors hover:border-line-strong aria-checked:border-accent"
                  >
                    <span
                      className={`absolute size-2.5 rounded-full bg-muted ${position.startsWith('top') ? 'top-1.5' : 'bottom-1.5'} ${position.endsWith('left') ? 'left-1.5' : 'right-1.5'} group-aria-checked:bg-accent`}
                    />
                  </button>
                ))}
              </div>
              <SegmentedControl
                label={t('bubble.sizeLabel')}
                value={settings.bubbleSize}
                onChange={(bubbleSize) => update({ bubbleSize })}
                options={BUBBLE_SIZES.map((size) => ({
                  value: size,
                  label: t(`bubble.size.${size}`),
                }))}
              />
            </div>
          </div>
        )}

        <SwitchField
          id="countdown"
          label={t('countdown')}
          checked={settings.countdown}
          onChange={(countdown) => update({ countdown })}
        />

        {streams.error && (
          <p
            role="alert"
            className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
          >
            {t(
              `errors.${streams.error === 'capture_cancelled' ? 'capture_failed' : streams.error}`,
            )}
          </p>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={isStarting}
          className="flex h-12 cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-primary px-5 font-medium text-on-primary transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
        >
          <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" />
          {isStarting ? t('starting') : t('start')}
        </button>
      </aside>
    </div>
  )
}
