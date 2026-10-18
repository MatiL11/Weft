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
      WHISPER_CLI_PATH: 'whisper-cli',
      WHISPER_MODEL: 'base',
      WHISPER_MODELS_DIR: '/models',
      TRANSCRIBE_CONCURRENCY: 1,
      S3_BUCKET: 'weft',
      LOG_LEVEL: 'info',
    })
  })

  it('accepts SMTP URLs only', () => {
    expect(loadConfig({ ...VALID, SMTP_URL: 'smtps://u:p@mail.example.com:465' }).SMTP_URL).toBe(
      'smtps://u:p@mail.example.com:465',
    )
    expect(() => loadConfig({ ...VALID, SMTP_URL: 'http://mail' })).toThrow(/SMTP_URL/)
  })

  it('reports every invalid variable', () => {
    expect(() => loadConfig({ ...VALID, DATABASE_URL: 'nope', RENDER_CONCURRENCY: '0' })).toThrow(
      /DATABASE_URL[\s\S]*RENDER_CONCURRENCY/,
    )
  })
})
