import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, isRecordingSettings, modeUses } from './recording-settings'

describe('modeUses', () => {
  it.each([
    ['screen-camera', { screen: true, camera: true }],
    ['screen', { screen: true, camera: false }],
    ['camera', { screen: false, camera: true }],
  ] as const)('%s', (mode, expected) => {
    expect(modeUses(mode)).toEqual(expected)
  })
})

describe('isRecordingSettings', () => {
  it('accepts the defaults and a full valid object', () => {
    expect(isRecordingSettings(DEFAULT_SETTINGS)).toBe(true)
    expect(
      isRecordingSettings({
        ...DEFAULT_SETTINGS,
        mode: 'camera',
        cameraId: 'abc',
        microphoneId: 'none',
      }),
    ).toBe(true)
  })

  it.each([
    null,
    'x',
    {},
    { ...DEFAULT_SETTINGS, mode: 'tab' },
    { ...DEFAULT_SETTINGS, bubbleSize: 'huge' },
    { ...DEFAULT_SETTINGS, bubblePosition: 'center' },
    { ...DEFAULT_SETTINGS, countdown: 'yes' },
    { ...DEFAULT_SETTINGS, cameraId: 42 },
  ])('rejects stale or tampered storage %#', (value) => {
    expect(isRecordingSettings(value)).toBe(false)
  })
})
