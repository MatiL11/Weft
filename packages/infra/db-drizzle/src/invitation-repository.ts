import type {
  EmailLocale,
  InvitableRole,
  Invitation,
  InvitationRepository,
  UserDirectory,
  UserProfile,
} from '@weft/core'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Database } from './client'
import { invitations, users } from './schema'

const toInvitation = (row: typeof invitations.$inferSelect): Invitation => ({
  ...row,
  role: row.role as InvitableRole,
})

export class DrizzleInvitationRepository implements InvitationRepository {
  constructor(private readonly db: Database) {}

  async create(invitation: Invitation): Promise<void> {
    await this.db.insert(invitations).values(invitation)
  }

  async update(invitation: Invitation): Promise<void> {
    const { acceptedAt, revokedAt } = invitation
    await this.db
      .update(invitations)
      .set({ acceptedAt, revokedAt })
      .where(eq(invitations.id, invitation.id))
  }

  async findById(id: string): Promise<Invitation | null> {
    const [row] = await this.db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
    return row ? toInvitation(row) : null
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const [row] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1)
    return row ? toInvitation(row) : null
  }

  async listOpen(workspaceId: string): Promise<Invitation[]> {
    const rows = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.workspaceId, workspaceId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .orderBy(invitations.createdAt)
    return rows.map(toInvitation)
  }

  async listOpenForEmail(email: string): Promise<Invitation[]> {
    const rows = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
    return rows.map(toInvitation)
  }
}

/** Accounts, as stored by the auth system. */
export class DrizzleUserDirectory implements UserDirectory {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<UserProfile | null> {
    return this.findOne(eq(users.id, id))
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    return this.findOne(sql`lower(${users.email}) = ${email.toLowerCase()}`)
  }

  async findByIds(ids: readonly string[]): Promise<UserProfile[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .select({ id: users.id, name: users.name, email: users.email, locale: users.locale })
      .from(users)
      .where(inArray(users.id, [...ids]))
    return rows.map((row) => ({ ...row, locale: row.locale === 'es' ? 'es' : 'en' }))
  }

  async hasAny(): Promise<boolean> {
    const [row] = await this.db.select({ id: users.id }).from(users).limit(1)
    return row !== undefined
  }

  /** Remembers the language someone signed up in, for their emails. */
  async setLocale(id: string, locale: EmailLocale): Promise<void> {
    await this.db.update(users).set({ locale }).where(eq(users.id, id))
  }

  private async findOne(condition: ReturnType<typeof eq>): Promise<UserProfile | null> {
    const [row] = await this.db
      .select({ id: users.id, name: users.name, email: users.email, locale: users.locale })
      .from(users)
      .where(condition)
      .limit(1)
    return row ? { ...row, locale: row.locale === 'es' ? 'es' : 'en' } : null
  }
}
