import { createVideo } from '@weft/core'
import { describe, expect, it } from 'vitest'
import {
  FailureLimiter,
  HmacVideoAccessTokens,
  ScryptPasswordHasher,
  UnlockLimiter,
} from './security'

const video = (passwordHash: string | null) => ({
  ...createVideo({ id: 'vid_1', workspaceId: 'w', ownerId: 'u', title: 'T', now: new Date() }),
  privacy: 'password' as const,
  passwordHash,
})

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher()

  it('verifies the right password and rejects others', async () => {
    const hash = await hasher.hash('correct horse')
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/)
    expect(await hasher.hash('correct horse')).not.toBe(hash)
    expect(await hasher.verify('correct horse', hash)).toBe(true)
    expect(await hasher.verify('correct horsE', hash)).toBe(false)
  })

  it('rejects malformed hashes', async () => {
    expect(await hasher.verify('x', 'plain')).toBe(false)
    expect(await hasher.verify('x', 'scrypt$16384$8$1$c2FsdA==$c2hvcnQ=')).toBe(false)
  })
})

describe('HmacVideoAccessTokens', () => {
  const tokens = new HmacVideoAccessTokens('a'.repeat(32))

  it('accepts its own tokens until the password changes', () => {
    const token = tokens.issue(video('hash-1'))
    expect(tokens.verify(video('hash-1'), token)).toBe(true)
    expect(tokens.verify(video('hash-2'), token)).toBe(false)
    expect(tokens.verify(video(null), token)).toBe(false)
    expect(tokens.verify(video('hash-1'), 'forged')).toBe(false)
  })

  it('depends on the server secret', () => {
    const other = new HmacVideoAccessTokens('b'.repeat(32))
    expect(other.verify(video('hash-1'), tokens.issue(video('hash-1')))).toBe(false)
  })
})

describe('UnlockLimiter', () => {
  it('blocks a client after repeated wrong passwords, and a video after many overall', () => {
    let now = 0
    const clock = () => now
    const limiter = new UnlockLimiter(
      new FailureLimiter(2, 1000, clock),
      new FailureLimiter(3, 1000, clock),
    )

    limiter.recordFailure('v1', 'a')
    expect(limiter.isBlocked('v1', 'a')).toBe(false)
    limiter.recordFailure('v1', 'a')
    expect(limiter.isBlocked('v1', 'a')).toBe(true)
    expect(limiter.isBlocked('v1', 'b')).toBe(false)
    expect(limiter.isBlocked('v2', 'a')).toBe(false)

    limiter.recordFailure('v1', 'b')
    expect(limiter.isBlocked('v1', 'c')).toBe(true)

    now = 1000
    expect(limiter.isBlocked('v1', 'a')).toBe(false)
    limiter.recordFailure('v2', 'a')
    expect(limiter.isBlocked('v2', 'a')).toBe(false)
  })
})
