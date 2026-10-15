import { describe, expect, it } from 'vitest'
import {
  createSession,
  elapsedMs,
  remainingCountdownMs,
  transition,
  type SessionState,
} from './session'

const LIMIT = 60_000

function started(at = 0, countdownMs = 3000): SessionState {
  return transition(createSession({ limitMs: LIMIT }), { type: 'start', at, countdownMs })
}

function recordingAt(at: number): SessionState {
  return transition(started(0, 0), { type: 'tick', at })
}

describe('recording session', () => {
  it('starts idle with no elapsed time', () => {
    const s = createSession({ limitMs: LIMIT })
    expect(s.status).toBe('idle')
    expect(elapsedMs(s, 10_000)).toBe(0)
  })

  it('counts down before recording', () => {
    const s = started(1000, 3000)
    expect(s.status).toBe('countdown')
    expect(remainingCountdownMs(s, 2500)).toBe(1500)
    expect(transition(s, { type: 'tick', at: 3999 }).status).toBe('countdown')
  })

  it('starts recording exactly when the countdown ends, even if the tick is late', () => {
    const s = transition(started(1000, 3000), { type: 'tick', at: 4500 })
    expect(s.status).toBe('recording')
    expect(elapsedMs(s, 4500)).toBe(500)
  })

  it('starts recording immediately without a countdown', () => {
    const s = started(1000, 0)
    expect(s.status).toBe('recording')
    expect(elapsedMs(s, 1250)).toBe(250)
  })

  it('excludes paused time from the elapsed time', () => {
    let s = started(0, 0)
    s = transition(s, { type: 'pause', at: 10_000 })
    expect(s.status).toBe('paused')
    expect(elapsedMs(s, 50_000)).toBe(10_000)

    s = transition(s, { type: 'resume', at: 50_000 })
    expect(s.status).toBe('recording')
    expect(elapsedMs(s, 52_000)).toBe(12_000)
  })

  it('stops at the user request and freezes the elapsed time', () => {
    const s = transition(recordingAt(0), { type: 'stop', at: 7000 })
    expect(s).toMatchObject({ status: 'stopped', stopReason: 'user' })
    expect(elapsedMs(s, 99_000)).toBe(7000)
  })

  it('can stop while paused', () => {
    let s = transition(recordingAt(0), { type: 'pause', at: 4000 })
    s = transition(s, { type: 'stop', at: 9000 })
    expect(s.status).toBe('stopped')
    expect(elapsedMs(s, 9000)).toBe(4000)
  })

  it('stops automatically at the duration limit, capping the elapsed time', () => {
    const s = transition(recordingAt(0), { type: 'tick', at: LIMIT + 800 })
    expect(s).toMatchObject({ status: 'stopped', stopReason: 'limit' })
    expect(elapsedMs(s, LIMIT + 5000)).toBe(LIMIT)
  })

  it('reports the remaining time before the limit', () => {
    let s = started(0, 0)
    s = transition(s, { type: 'pause', at: 20_000 })
    s = transition(s, { type: 'resume', at: 30_000 })
    expect(LIMIT - elapsedMs(s, 40_000)).toBe(30_000)
  })

  it('can be cancelled during the countdown or while recording', () => {
    expect(transition(started(), { type: 'cancel' }).status).toBe('cancelled')
    expect(transition(recordingAt(0), { type: 'cancel' }).status).toBe('cancelled')
  })

  it('records a failure with its reason from any active state', () => {
    const s = transition(recordingAt(0), { type: 'fail', reason: 'capture_ended' })
    expect(s).toMatchObject({ status: 'failed', failure: 'capture_ended' })
  })

  it('ignores events that are not valid in the current state', () => {
    const idle = createSession({ limitMs: LIMIT })
    expect(transition(idle, { type: 'pause', at: 1 })).toBe(idle)
    expect(transition(idle, { type: 'stop', at: 1 })).toBe(idle)

    const recording = recordingAt(0)
    expect(transition(recording, { type: 'resume', at: 5 })).toBe(recording)
    expect(transition(recording, { type: 'start', at: 5, countdownMs: 0 })).toBe(recording)

    const countdown = started()
    expect(transition(countdown, { type: 'pause', at: 5 })).toBe(countdown)

    const stopped = transition(recording, { type: 'stop', at: 10 })
    expect(transition(stopped, { type: 'cancel' })).toBe(stopped)
    expect(transition(stopped, { type: 'fail', reason: 'x' })).toBe(stopped)
  })

  it('can be reset to idle once finished', () => {
    const stopped = transition(recordingAt(0), { type: 'stop', at: 10 })
    expect(transition(stopped, { type: 'reset' })).toEqual(createSession({ limitMs: LIMIT }))
    const recording = recordingAt(0)
    expect(transition(recording, { type: 'reset' })).toBe(recording)
  })

  it('never mutates the previous state', () => {
    const s = Object.freeze(recordingAt(0))
    expect(() => transition(s, { type: 'pause', at: 1000 })).not.toThrow()
  })

  it('rejects a non-positive limit', () => {
    expect(() => createSession({ limitMs: 0 })).toThrow(RangeError)
  })
})
