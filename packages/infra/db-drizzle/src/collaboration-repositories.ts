import type {
  Comment,
  CommentRepository,
  CommentWithAuthor,
  Reaction,
  ReactionEmoji,
  ReactionRepository,
} from '@weft/core'
import { asc, desc, eq, getTableColumns } from 'drizzle-orm'
import type { Database } from './client'
import { comments, reactions, users } from './schema'

const commentWithAuthor = {
  ...getTableColumns(comments),
  authorName: users.name,
}

type CommentRow = typeof comments.$inferSelect & { authorName: string }

const toComment = ({ authorName, ...row }: CommentRow): CommentWithAuthor => ({
  ...row,
  author: { id: row.authorId, name: authorName },
})

export class DrizzleCommentRepository implements CommentRepository {
  constructor(private readonly db: Database) {}

  async create(comment: Comment): Promise<void> {
    await this.db.insert(comments).values(comment)
  }

  async update(comment: Comment): Promise<void> {
    const { id, body, editedAt, deletedAt } = comment
    await this.db.update(comments).set({ body, editedAt, deletedAt }).where(eq(comments.id, id))
  }

  async findById(id: string): Promise<CommentWithAuthor | null> {
    const [row] = await this.selectWithAuthor().where(eq(comments.id, id)).limit(1)
    return row ? toComment(row) : null
  }

  async listForVideo(videoId: string): Promise<CommentWithAuthor[]> {
    const rows = await this.selectWithAuthor()
      .where(eq(comments.videoId, videoId))
      .orderBy(asc(comments.createdAt), asc(comments.id))
    return rows.map(toComment)
  }

  private selectWithAuthor() {
    return this.db
      .select(commentWithAuthor)
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
  }
}

export class DrizzleReactionRepository implements ReactionRepository {
  constructor(private readonly db: Database) {}

  async create(reaction: Reaction): Promise<void> {
    await this.db.insert(reactions).values(reaction)
  }

  async listForVideo(videoId: string, options: { limit: number }): Promise<Reaction[]> {
    const rows = await this.db
      .select()
      .from(reactions)
      .where(eq(reactions.videoId, videoId))
      .orderBy(desc(reactions.createdAt), desc(reactions.id))
      .limit(options.limit)
    return rows.reverse().map((row) => ({ ...row, emoji: row.emoji as ReactionEmoji }))
  }
}
