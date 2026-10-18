import { createHmac, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import type { PasswordHasher, Video, VideoAccessTokens } from '@weft/core'

const SCRYPT = { N: 16_384, r: 8, p: 1 } as const
const KEY_LENGTH = 32

function deriveKey(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  )
}

/** Video passwords hashed with scrypt; the parameters are stored with each hash. */
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16)
    const key = await deriveKey(password, salt, SCRYPT)
    return [
      'scrypt',
      SCRYPT.N,
      SCRYPT.r,
      SCRYPT.p,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$')
  }

  async verify(password: string, hash: string): Promise<boolean> {
    const [scheme, n, r, p, salt, expected] = hash.split('$')
    if (scheme !== 'scrypt' || !salt || !expected) return false
    const expectedKey = Buffer.from(expected, 'base64')
    const key = await deriveKey(password, Buffer.from(salt, 'base64'), {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
    return key.length === expectedKey.length && timingSafeEqual(key, expectedKey)
  }
}

/**
 * HMAC tokens proving a viewer entered a video's password. They cover the password hash,
 * so changing the password (or removing it) invalidates every token issued before.
 */
export class HmacVideoAccessTokens implements VideoAccessTokens {
  private readonly key: Buffer

  constructor(secret: string) {
    // A key of its own, so these tokens can never be confused with other signatures.
    this.key = createHmac('sha256', secret).update('weft:video-access:v1').digest()
  }

  issue(video: Video): string {
    return createHmac('sha256', this.key)
      .update(`${video.id}:${video.passwordHash ?? ''}`)
      .digest('base64url')
  }

  verify(video: Video, token: string): boolean {
    if (!video.passwordHash) return false
    const expected = Buffer.from(this.issue(video))
    const given = Buffer.from(token)
    return given.length === expected.length && timingSafeEqual(given, expected)
  }
}

/** Fixed-window failure counter: blocks a key once it fails too often within the window. */
export class FailureLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>()

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  isBlocked(key: string): boolean {
    const window = this.current(key)
    return window !== undefined && window.count >= this.maxFailures
  }

  recordFailure(key: string): void {
    const window = this.current(key)
    if (window) {
      window.count += 1
      return
    }
    this.prune()
    this.windows.set(key, { startedAt: this.now(), count: 1 })
  }

  private current(key: string) {
    const window = this.windows.get(key)
    return window && this.now() - window.startedAt < this.windowMs ? window : undefined
  }

  private prune() {
    const now = this.now()
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key)
    }
  }
}

/**
 * Slows down password guessing. Only wrong passwords count: each client gets a few guesses
 * per video, and every video has a larger overall cap in case clients rotate addresses.
 */
export class UnlockLimiter {
  constructor(
    private readonly perClient: FailureLimiter,
    private readonly perVideo: FailureLimiter,
  ) {}

  isBlocked(videoId: string, client: string): boolean {
    return this.perClient.isBlocked(`${client} ${videoId}`) || this.perVideo.isBlocked(videoId)
  }

  recordFailure(videoId: string, client: string): void {
    this.perClient.recordFailure(`${client} ${videoId}`)
    this.perVideo.recordFailure(videoId)
  }
}

/** Allows a number of requests per window and key (e.g. reactions per viewer and video). */
export class HitLimiter extends FailureLimiter {
  tryHit(key: string): boolean {
    if (this.isBlocked(key)) return false
    this.recordFailure(key)
    return true
  }
}
