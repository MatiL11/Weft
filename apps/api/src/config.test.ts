import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const VALID = {
  DATABASE_URL: 'postgres://weft:weft@localhost:5432/weft',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  S3_ENDPOINT: 'http://seaweedfs:8333',
  S3_PUBLIC_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY_ID: 'weft',
  S3_SECRET_ACCESS_KEY: 'weft-secret',
}

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig(VALID)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      PUBLIC_URL: 'http://localhost:3000',
      RUN_MIGRATIONS: true,
      OPEN_SIGNUP: true,
      LOG_LEVEL: 'info',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'weft',
    })
  })

  it('coerces PORT and RUN_MIGRATIONS from strings', () => {
    const config = loadConfig({ ...VALID, PORT: '8080', RUN_MIGRATIONS: 'false' })
    expect(config.PORT).toBe(8080)
    expect(config.RUN_MIGRATIONS).toBe(false)
    expect(loadConfig({ ...VALID, OPEN_SIGNUP: 'false' }).OPEN_SIGNUP).toBe(false)
  })

  it('fails fast with a readable message listing every problem', () => {
    expect(() => loadConfig({ BETTER_AUTH_SECRET: 'short' })).toThrowError(
      /DATABASE_URL[\s\S]*BETTER_AUTH_SECRET: BETTER_AUTH_SECRET must be at least 32 characters/,
    )
  })
})
