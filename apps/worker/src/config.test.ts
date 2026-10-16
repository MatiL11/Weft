import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const VALID = {
  DATABASE_URL: 'postgres://weft:weft@localhost:5432/weft',
  S3_ENDPOINT: 'http://storage:8333',
  S3_ACCESS_KEY_ID: 'weft',
  S3_SECRET_ACCESS_KEY: 'weft-secret',
}

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig(VALID)).toMatchObject({
      FFMPEG_PATH: 'ffmpeg',
      FFPROBE_PATH: 'ffprobe',
      RENDER_CONCURRENCY: 1,
      S3_BUCKET: 'weft',
      LOG_LEVEL: 'info',
    })
  })

  it('reports every invalid variable', () => {
    expect(() => loadConfig({ ...VALID, DATABASE_URL: 'nope', RENDER_CONCURRENCY: '0' })).toThrow(
      /DATABASE_URL[\s\S]*RENDER_CONCURRENCY/,
    )
  })
})
