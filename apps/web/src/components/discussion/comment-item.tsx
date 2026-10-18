'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { initialOf, type CommentView } from '@/lib/discussion'
import { formatClock } from '@/lib/player-timeline'
import { CommentComposer } from './comment-composer'

interface CommentItemProps {
  comment: CommentView
  viewerId: string | null
  canModerate: boolean
  now: Date
  onSeek: (ms: number) => void
  onReply?: () => void
  onEdit: (body: string) => Promise<void>
  onDelete: () => Promise<void>
}

export function CommentItem({
  comment,
  viewerId,
  canModerate,
  now,
  onSeek,
  onReply,
  onEdit,
  onDelete,
}: CommentItemProps) {
  const t = useTranslations('video.comments')
  const format = useFormatter()
  const [isEditing, setIsEditing] = useState(false)
  const isAuthor = viewerId !== null && viewerId === comment.author.id

  if (comment.deleted) {
    return <p className="py-1 text-sm text-muted italic">{t('deleted')}</p>
  }

  return (
    <article className="grid grid-cols-[1.75rem_1fr] gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
      >
        {initialOf(comment.author.name)}
      </span>
      <div className="grid min-w-0 gap-1">
        <header className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="text-sm font-medium">{comment.author.name}</span>
          <time dateTime={comment.createdAt} className="text-muted">
            {format.relativeTime(new Date(comment.createdAt), now)}
          </time>
          {comment.editedAt && <span className="text-muted">· {t('edited')}</span>}
        </header>
        {isEditing ? (
          <CommentComposer
            initialBody={comment.body}
            submitLabel={t('save')}
            autoFocus
            onCancel={() => setIsEditing(false)}
            onSubmit={async (body) => {
              await onEdit(body)
              setIsEditing(false)
            }}
          />
        ) : (
          <p className="text-sm break-words whitespace-pre-wrap">
            {comment.timestampMs !== null && (
              <button
                type="button"
                onClick={() => onSeek(comment.timestampMs as number)}
                aria-label={t('jumpTo', { time: formatClock(comment.timestampMs / 1000) })}
                className="mr-1.5 cursor-pointer rounded-md bg-accent-soft px-1.5 py-px font-mono text-xs text-accent tabular-nums hover:bg-accent hover:text-on-accent"
              >
                {formatClock(comment.timestampMs / 1000)}
              </button>
            )}
            {comment.body}
          </p>
        )}
        {!isEditing && viewerId && (
          <div className="flex gap-3 text-xs text-muted">
            {onReply && (
              <button type="button" onClick={onReply} className="cursor-pointer hover:text-fg">
                {t('reply')}
              </button>
            )}
            {isAuthor && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="cursor-pointer hover:text-fg"
              >
                {t('edit')}
              </button>
            )}
            {(isAuthor || canModerate) && (
              <button
                type="button"
                onClick={() => void onDelete()}
                className="cursor-pointer hover:text-danger"
              >
                {t('delete')}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
