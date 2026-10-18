import type { TranscriptSegment, VideoRender } from '@weft/core'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  type AnyPgColumn,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// ── Auth tables (shape required by Better Auth; property names must match its field names) ──

export const users = pgTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [index().on(t.userId)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
)

export const verifications = pgTable(
  'verifications',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.identifier)],
)

// ── Domain tables ──

export const workspaces = pgTable('workspaces', {
  id: text().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
})

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index().on(t.userId),
    check('workspace_members_role_check', sql`${t.role} in ('owner', 'admin', 'member', 'viewer')`),
  ],
)

export const videos = pgTable(
  'videos',
  {
    id: text().primaryKey(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    status: text().notNull(),
    privacy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    completedAt: timestamp({ withTimezone: true }),
    durationMs: integer(),
    trimStartMs: integer(),
    trimEndMs: integer(),
    passwordHash: text(),
    renderState: text().notNull().default('none'),
    renderVersion: integer().notNull().default(0),
    render: jsonb().$type<VideoRender>(),
    transcriptLanguage: text().notNull().default('auto'),
    transcriptionState: text().notNull().default('none'),
    transcriptionVersion: integer().notNull().default(0),
  },
  (t) => [
    index().on(t.workspaceId, t.createdAt),
    index().on(t.ownerId),
    check('videos_status_check', sql`${t.status} in ('recording', 'ready')`),
    check(
      'videos_privacy_check',
      sql`${t.privacy} in ('link', 'workspace', 'password', 'private')`,
    ),
    check(
      'videos_render_state_check',
      sql`${t.renderState} in ('none', 'queued', 'processing', 'ready', 'failed')`,
    ),
    check(
      'videos_transcription_state_check',
      sql`${t.transcriptionState} in ('none', 'queued', 'processing', 'ready', 'failed', 'no_audio')`,
    ),
    check('videos_trim_check', sql`(${t.trimStartMs} is null) = (${t.trimEndMs} is null)`),
    check(
      'videos_password_check',
      sql`(${t.privacy} = 'password') = (${t.passwordHash} is not null)`,
    ),
  ],
)

export const videoSegments = pgTable(
  'video_segments',
  {
    videoId: text()
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    index: integer().notNull(),
    startMs: integer().notNull(),
    byteLength: bigint({ mode: 'number' }).notNull(),
    sha256: text().notNull(),
    uploadedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.videoId, t.kind, t.index] }),
    check('video_segments_kind_check', sql`${t.kind} in ('init', 'media')`),
  ],
)

export const transcripts = pgTable('transcripts', {
  videoId: text()
    .primaryKey()
    .references(() => videos.id, { onDelete: 'cascade' }),
  renderVersion: integer().notNull(),
  language: text().notNull(),
  segments: jsonb().$type<TranscriptSegment[]>().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
})

export const comments = pgTable(
  'comments',
  {
    id: text().primaryKey(),
    videoId: text()
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    authorId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Replies are deleted with their thread.
    parentId: text().references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    timestampMs: integer(),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    editedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.videoId, t.createdAt)],
)

export const reactions = pgTable(
  'reactions',
  {
    id: text().primaryKey(),
    videoId: text()
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    userId: text().references(() => users.id, { onDelete: 'set null' }),
    emoji: text().notNull(),
    timestampMs: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index().on(t.videoId, t.createdAt)],
)

/** Mapping passed to Better Auth's Drizzle adapter (model name → table). */
export const authSchema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
}
