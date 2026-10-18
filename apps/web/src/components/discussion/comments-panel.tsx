'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { threads, type DiscussionEvent, type Discussion } from '@/lib/discussion'
import { addComment, deleteComment, editComment } from '@/lib/video-api'
import { CommentComposer } from './comment-composer'
import { CommentItem } from './comment-item'

interface CommentsPanelProps {
  videoId: string
  discussion: Discussion | null
  apply: (event: DiscussionEvent) => void
  currentMs: number
  onSeek: (ms: number) => void
}

/** Threaded, timestamped comments with a composer for signed-in viewers. */
export function CommentsPanel({
  videoId,
  discussion,
  apply,
  currentMs,
  onSeek,
}: CommentsPanelProps) {
  const t = useTranslations('video.comments')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const now = new Date()

  if (!discussion) {
    return <p className="p-4 text-sm text-muted">{t('loading')}</p>
  }

  const list = threads(discussion.comments)
  const itemProps = (id: string) => ({
    viewerId: discussion.viewerId,
    canModerate: discussion.canModerate,
    now,
    onSeek,
    onEdit: async (body: string) => {
      apply({ type: 'comment.updated', comment: await editComment(videoId, id, body) })
    },
    onDelete: async () => {
      await deleteComment(videoId, id)
      apply({ type: 'comment.deleted', commentId: id })
    },
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {list.length === 0 && <li className="text-sm text-muted">{t('empty')}</li>}
        {list.map(({ comment, replies }) => (
          <li key={comment.id} className="grid gap-3">
            <CommentItem
              comment={comment}
              {...itemProps(comment.id)}
              onReply={comment.deleted ? undefined : () => setReplyingTo(comment.id)}
            />
            {(replies.length > 0 || replyingTo === comment.id) && (
              <ol className="ml-3.5 grid gap-3 border-l border-line pl-4">
                {replies.map((reply) => (
                  <li key={reply.id}>
                    <CommentItem comment={reply} {...itemProps(reply.id)} />
                  </li>
                ))}
                {replyingTo === comment.id && (
                  <li>
                    <CommentComposer
                      submitLabel={t('reply')}
                      autoFocus
                      onCancel={() => setReplyingTo(null)}
                      onSubmit={async (body) => {
                        const reply = await addComment(videoId, { body, parentId: comment.id })
                        apply({ type: 'comment.created', comment: reply })
                        setReplyingTo(null)
                      }}
                    />
                  </li>
                )}
              </ol>
            )}
          </li>
        ))}
      </ol>
      <div className="border-t border-line p-3">
        {discussion.viewerId ? (
          <CommentComposer
            currentMs={currentMs}
            submitLabel={t('send')}
            onSubmit={async (body, timestampMs) => {
              apply({
                type: 'comment.created',
                comment: await addComment(videoId, { body, timestampMs }),
              })
            }}
          />
        ) : (
          <p className="text-sm text-muted">
            <Link
              href="/sign-in"
              className="font-medium text-fg underline decoration-accent decoration-2 underline-offset-4"
            >
              {t('signIn')}
            </Link>{' '}
            {t('signInHint')}
          </p>
        )}
      </div>
    </div>
  )
}
