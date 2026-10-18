import { describe, expect, it } from 'vitest'
import { clientIpFrom } from './context'

describe('clientIpFrom', () => {
  it('trusts only the entry added by the trusted proxy, not what the client sent', () => {
    // The client forged 6.6.6.6; the web app's proxy appended the real address.
    expect(clientIpFrom('6.6.6.6, 203.0.113.7', 1)).toBe('203.0.113.7')
    expect(clientIpFrom('203.0.113.7, 10.0.0.2', 2)).toBe('203.0.113.7')
    expect(clientIpFrom(undefined, 1)).toBe('unknown')
    expect(clientIpFrom('1.2.3.4', 3)).toBe('unknown')
  })
})
