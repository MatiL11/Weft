import { fileURLToPath } from 'node:url'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema>

export interface DatabaseHandle {
  db: Database
  close(): Promise<void>
}

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url))

export function connectDatabase(url: string): DatabaseHandle {
  const client = postgres(url, { max: 10, onnotice: () => {} })
  const db = drizzle(client, { schema, casing: 'snake_case' })
  return { db, close: () => client.end() }
}

export async function runMigrations(url: string, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client, { casing: 'snake_case' }), { migrationsFolder })
  } finally {
    await client.end()
  }
}
