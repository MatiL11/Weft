import { describe, expect, it } from 'vitest'
import { embedSnippet, parseEmbedOptions, requestOrigin } from './share-meta'

const headers = (values: Record<string, string>) => new Headers(values)

describe('requestOrigin', () => {
  it('prefers forwarded headers from a reverse proxy', () => {
    expect(
      requestOrigin(
        headers({
          host: 'web:3000',
          'x-forwarded-host': 'weft.example, proxy',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://weft.example')
    expect(requestOrigin(headers({ host: 'localhost:3100' }))).toBe('http://localhost:3100')
    expect(requestOrigin(headers({}))).toBe('http://localhost:3000')
  })
})

describe('embeds', () => {
  it('builds an iframe snippet', () => {
    expect(embedSnippet('https://weft.example', 'abc')).toBe(
      '<iframe src="https://weft.example/embed/abc" width="960" height="540" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>',
    )
  })

  it('reads embed options, muting autoplay', () => {
    expect(parseEmbedOptions({})).toEqual({
      autoplay: false,
      muted: false,
      hideTitle: false,
      startAt: 0,
    })
    expect(parseEmbedOptions({ autoplay: '1', hide_title: 'true', t: '1m5s' })).toEqual({
      autoplay: true,
      muted: true,
      hideTitle: true,
      startAt: 65,
    })
    expect(parseEmbedOptions({ muted: 'yes', t: ['1', '2'] })).toMatchObject({
      muted: true,
      startAt: 0,
    })
  })
})
