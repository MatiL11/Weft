import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-next'

describe('safeNextPath', () => {
  it.each([
    ['/invite/abc', '/invite/abc'],
    ['/v/x?t=3', '/v/x?t=3'],
    [undefined, '/'],
    [['/a', '/b'], '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
  ])('%j → %j', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected)
  })
})
