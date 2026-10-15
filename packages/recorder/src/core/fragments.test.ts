import { describe, expect, it } from 'vitest'
import { createFragmentCollector, type MediaSegment } from './fragments'

const bytes = (...values: number[]) => new Uint8Array(values)

function collect() {
  const inits: Uint8Array[] = []
  const segments: MediaSegment[] = []
  const collector = createFragmentCollector({
    onInit: (data) => inits.push(data),
    onSegment: (segment) => segments.push(segment),
  })
  return { collector, inits, segments }
}

describe('fragment collector', () => {
  it('emits the init segment as ftyp + moov', () => {
    const { collector, inits } = collect()
    collector.onFtyp(bytes(1, 2), 0)
    collector.onMoov(bytes(3), 2)
    expect(inits).toEqual([bytes(1, 2, 3)])
  })

  it('pairs each moof with the following mdat into a numbered segment', () => {
    const { collector, segments } = collect()
    collector.onFtyp(bytes(1), 0)
    collector.onMoov(bytes(2), 1)
    collector.onMoof(bytes(10), 2, 0)
    collector.onMdat(bytes(11, 12), 3)
    collector.onMoof(bytes(20), 5, 4.02)
    collector.onMdat(bytes(21), 6)

    expect(segments).toEqual([
      { index: 0, startTime: 0, data: bytes(10, 11, 12) },
      { index: 1, startTime: 4.02, data: bytes(20, 21) },
    ])
  })

  it('copies the bytes so later buffer reuse cannot corrupt a segment', () => {
    const { collector, segments } = collect()
    const moof = bytes(1)
    const mdat = bytes(2)
    collector.onFtyp(bytes(0), 0)
    collector.onMoov(bytes(0), 1)
    collector.onMoof(moof, 2, 0)
    collector.onMdat(mdat, 3)
    moof[0] = 99
    mdat[0] = 99
    expect(segments[0]?.data).toEqual(bytes(1, 2))
  })

  it('rejects media data that arrives before its moof', () => {
    const { collector } = collect()
    collector.onFtyp(bytes(0), 0)
    collector.onMoov(bytes(0), 1)
    expect(() => collector.onMdat(bytes(1), 2)).toThrow(/without a preceding moof/)
  })

  it('rejects a moov without ftyp and fragments before the init segment', () => {
    expect(() => collect().collector.onMoov(bytes(1), 0)).toThrow(/ftyp/)
    expect(() => collect().collector.onMoof(bytes(1), 0, 0)).toThrow(/init segment/)
  })
})
