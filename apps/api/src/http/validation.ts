import type { Context } from 'hono'
import type { z } from 'zod'
import { fail } from './envelope'

/** Parses a JSON body against a schema; null when it is missing or invalid. */
export async function parseJson<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.infer<T> | null> {
  const result = schema.safeParse(await c.req.json().catch(() => null))
  return result.success ? result.data : null
}

export const invalid = (c: Context) =>
  c.json(fail('validation_error', 'Invalid request body.'), 400)
