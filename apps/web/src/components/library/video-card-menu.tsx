'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { deleteVideo, moveVideo, restoreVideo, trashVideo } from '@/lib/video-api'
import type { FolderSummary } from './library-toolbar'

interface VideoCardMenuProps {
  videoId: string
  folderId: string | null
  folders: FolderSummary[]
  isTrashed: boolean
}

/** Owner actions on a library card: move to a folder, trash, restore, delete for good. */
export function VideoCardMenu({ videoId, folderId, folders, isTrashed }: VideoCardMenuProps) {
  const t = useTranslations('library')
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [isOpen])

  async function run(action: () => Promise<unknown>) {
    setIsOpen(false)
    try {
      await action()
    } finally {
      router.refresh()
    }
  }

  const item =
    'w-full cursor-pointer rounded-lg px-3 py-1.5 text-left text-sm hover:bg-surface-sunken'

  return (
    <div
      ref={rootRef}
      className="absolute top-2 right-2 z-10"
      onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
    >
      <button
        type="button"
        aria-label={t('actions')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="grid size-8 cursor-pointer place-items-center rounded-lg bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-1 grid w-56 gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-panel"
        >
          {isTrashed ? (
            <>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => void run(() => restoreVideo(videoId))}
              >
                {t('restore')}
              </button>
              {confirmDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} font-medium text-danger`}
                  onClick={() => void run(() => deleteVideo(videoId))}
                >
                  {t('confirmDelete')}
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-danger`}
                  onClick={() => setConfirmDelete(true)}
                >
                  {t('deleteForever')}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted">{t('moveTo')}</p>
              {[{ id: null, name: t('unfiled') }, ...folders].map((folder) => (
                <button
                  key={folder.id ?? 'root'}
                  type="button"
                  role="menuitemradio"
                  aria-checked={folder.id === folderId}
                  className={`${item} aria-checked:font-medium aria-checked:text-accent`}
                  onClick={() => void run(() => moveVideo(videoId, folder.id))}
                >
                  {folder.name}
                </button>
              ))}
              <div className="my-1 border-t border-line" />
              <button
                type="button"
                role="menuitem"
                className={`${item} text-danger`}
                onClick={() => void run(() => trashVideo(videoId))}
              >
                {t('moveToTrash')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
