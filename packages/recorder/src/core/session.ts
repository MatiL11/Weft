/**
 * Recording session state machine. Pure: every transition returns a new state and all
 * times are passed in (milliseconds from any monotonic clock), so it is fully testable.
 */

export type SessionStatus =
  'idle' | 'countdown' | 'recording' | 'paused' | 'stopped' | 'cancelled' | 'failed'

export type StopReason = 'user' | 'limit'

export interface SessionState {
  readonly status: SessionStatus
  /** Maximum active recording time. */
  readonly limitMs: number
  /** Active time accumulated in finished recording runs (excludes pauses). */
  readonly accumulatedMs: number
  /** Start of the current recording run, while recording. */
  readonly runStartedAt: number | null
  readonly countdownEndsAt: number | null
  readonly stopReason: StopReason | null
  readonly failure: string | null
}

export type SessionEvent =
  | { type: 'start'; at: number; countdownMs: number }
  | { type: 'tick'; at: number }
  | { type: 'pause'; at: number }
  | { type: 'resume'; at: number }
  | { type: 'stop'; at: number }
  | { type: 'cancel' }
  | { type: 'fail'; reason: string }
  | { type: 'reset' }

const ACTIVE: ReadonlySet<SessionStatus> = new Set(['countdown', 'recording', 'paused'])
const FINISHED: ReadonlySet<SessionStatus> = new Set(['stopped', 'cancelled', 'failed'])

export function createSession(options: { limitMs: number }): SessionState {
  if (!(options.limitMs > 0)) throw new RangeError('limitMs must be positive')
  return {
    status: 'idle',
    limitMs: options.limitMs,
    accumulatedMs: 0,
    runStartedAt: null,
    countdownEndsAt: null,
    stopReason: null,
    failure: null,
  }
}

/** Active recording time at `now`, excluding pauses and capped at the limit. */
export function elapsedMs(state: SessionState, now: number): number {
  const running = state.status === 'recording' && state.runStartedAt !== null
  const current = running ? Math.max(0, now - (state.runStartedAt as number)) : 0
  return Math.min(state.accumulatedMs + current, state.limitMs)
}

export function remainingCountdownMs(state: SessionState, now: number): number {
  if (state.status !== 'countdown' || state.countdownEndsAt === null) return 0
  return Math.max(0, state.countdownEndsAt - now)
}

function beginRecording(state: SessionState, at: number): SessionState {
  return { ...state, status: 'recording', runStartedAt: at, countdownEndsAt: null }
}

function finishRun(state: SessionState, at: number): SessionState {
  return { ...state, accumulatedMs: elapsedMs(state, at), runStartedAt: null }
}

function onTick(state: SessionState, at: number): SessionState {
  if (
    state.status === 'countdown' &&
    state.countdownEndsAt !== null &&
    at >= state.countdownEndsAt
  ) {
    return beginRecording(state, state.countdownEndsAt)
  }
  if (state.status === 'recording' && elapsedMs(state, at) >= state.limitMs) {
    return { ...finishRun(state, at), status: 'stopped', stopReason: 'limit' }
  }
  return state
}

export function transition(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'start':
      if (state.status !== 'idle') return state
      return event.countdownMs > 0
        ? { ...state, status: 'countdown', countdownEndsAt: event.at + event.countdownMs }
        : beginRecording(state, event.at)
    case 'tick':
      return onTick(state, event.at)
    case 'pause':
      return state.status === 'recording'
        ? { ...finishRun(state, event.at), status: 'paused' }
        : state
    case 'resume':
      return state.status === 'paused'
        ? { ...state, status: 'recording', runStartedAt: event.at }
        : state
    case 'stop':
      return state.status === 'recording' || state.status === 'paused'
        ? { ...finishRun(state, event.at), status: 'stopped', stopReason: 'user' }
        : state
    case 'cancel':
      return ACTIVE.has(state.status)
        ? { ...state, status: 'cancelled', runStartedAt: null }
        : state
    case 'fail':
      return ACTIVE.has(state.status)
        ? { ...state, status: 'failed', failure: event.reason, runStartedAt: null }
        : state
    case 'reset':
      return FINISHED.has(state.status) ? createSession({ limitMs: state.limitMs }) : state
  }
}
