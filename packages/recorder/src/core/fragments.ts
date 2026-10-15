/**
 * Groups the boxes of a fragmented MP4 (as reported by the muxer) into an init segment
 * (ftyp + moov) and numbered media segments (moof + mdat). Each media segment can be stored
 * or uploaded on its own; concatenating init + segments in order yields a playable file.
 */

export interface MediaSegment {
  readonly index: number
  /** Start timestamp of the fragment, in seconds. */
  readonly startTime: number
  readonly data: Uint8Array
}

export interface FragmentCollectorHandlers {
  onInit: (data: Uint8Array) => void
  onSegment: (segment: MediaSegment) => void
}

export interface FragmentCollector {
  onFtyp: (data: Uint8Array, position: number) => void
  onMoov: (data: Uint8Array, position: number) => void
  onMoof: (data: Uint8Array, position: number, timestamp: number) => void
  onMdat: (data: Uint8Array, position: number) => void
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

export function createFragmentCollector(handlers: FragmentCollectorHandlers): FragmentCollector {
  let ftyp: Uint8Array | null = null
  let hasInit = false
  let pendingMoof: { data: Uint8Array; timestamp: number } | null = null
  let nextIndex = 0

  return {
    onFtyp(data) {
      ftyp = data.slice()
    },
    onMoov(data) {
      if (!ftyp) throw new Error('Received moov before ftyp.')
      handlers.onInit(concat(ftyp, data))
      hasInit = true
    },
    onMoof(data, _position, timestamp) {
      if (!hasInit) throw new Error('Received a fragment before the init segment.')
      pendingMoof = { data: data.slice(), timestamp }
    },
    onMdat(data) {
      if (!pendingMoof) throw new Error('Received media data without a preceding moof.')
      handlers.onSegment({
        index: nextIndex,
        startTime: pendingMoof.timestamp,
        data: concat(pendingMoof.data, data),
      })
      nextIndex += 1
      pendingMoof = null
    },
  }
}
