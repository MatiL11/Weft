import { describe, expect, it } from 'vitest'
import { buildCsp, originOf } from './csp'

const BASE = {
  nonce: 'bm9uY2U=',
  storageOrigin: 'https://media.example.com',
  isEmbed: false,
  isDev: false,
  upgradeInsecure: true,
}

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `) || d === name)
    ?.slice(name.length)
    .trim()

describe('buildCsp', () => {
  it('only runs scripts from this origin or with the nonce, never eval in production', () => {
    const csp = buildCsp(BASE)
    expect(directive(csp, 'script-src')).toBe("'self' 'nonce-bm9uY2U=' 'strict-dynamic'")
    expect(directive(csp, 'object-src')).toBe("'none'")
    expect(directive(csp, 'base-uri')).toBe("'self'")
    expect(buildCsp({ ...BASE, isDev: true })).toContain("'unsafe-eval'")
  })

  it('lets media, thumbnails and uploads reach object storage', () => {
    const csp = buildCsp(BASE)
    for (const name of ['img-src', 'media-src', 'connect-src']) {
      expect(directive(csp, name)).toContain('https://media.example.com')
    }
    expect(directive(buildCsp({ ...BASE, storageOrigin: null }), 'connect-src')).toBe("'self'")
  })

  it('lets other sites frame only the embed player', () => {
    expect(directive(buildCsp(BASE), 'frame-ancestors')).toBe("'self'")
    expect(directive(buildCsp({ ...BASE, isEmbed: true }), 'frame-ancestors')).toBe('*')
  })

  it('upgrades insecure requests only when asked', () => {
    expect(directive(buildCsp(BASE), 'upgrade-insecure-requests')).toBe('')
    expect(buildCsp({ ...BASE, upgradeInsecure: false })).not.toContain('upgrade-insecure')
  })
})

describe('originOf', () => {
  it('keeps only the origin of http(s) URLs', () => {
    expect(originOf('https://media.example.com:8443/bucket?x=1')).toBe(
      'https://media.example.com:8443',
    )
    expect(originOf('http://localhost:8333')).toBe('http://localhost:8333')
    expect(originOf('javascript:alert(1)')).toBeNull()
    expect(originOf('not a url')).toBeNull()
    expect(originOf(undefined)).toBeNull()
  })
})
