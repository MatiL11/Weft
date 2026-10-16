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

/** Fixed-window attempt counter, e.g. to slow down password guessing per video. */
export class AttemptLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>()

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt; false once the key has used up its attempts for this window. */
  tryAttempt(key: string): boolean {
    const now = this.now()
    const window = this.windows.get(key)
    if (!window || now - window.startedAt >= this.windowMs) {
      this.prune(now)
      this.windows.set(key, { startedAt: now, count: 1 })
      return true
    }
    window.count += 1
    return window.count <= this.maxAttempts
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key)
    }
  }
}
