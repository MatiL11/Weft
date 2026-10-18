import { createHash, randomBytes } from 'node:crypto'
import type { SecretTokens } from '@weft/core'

/** 256-bit random link tokens; the database only ever sees their SHA-256. */
export class RandomSecretTokens implements SecretTokens {
  create(): string {
    return randomBytes(32).toString('base64url')
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
