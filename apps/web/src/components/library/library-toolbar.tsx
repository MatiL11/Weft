'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { libraryHref, type LibraryView } from '@/lib/library'
import { createFolder, deleteFolder, renameFolder } from '@/lib/video-api'

export interface FolderSummary {
  id: string
  name: string
}

interface LibraryToolbarProps {
  view: LibraryView
  folders: FolderSummary[]
  canEditFolders: boolean
}

const chip =
  'flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors whitespace-nowrap'
const chipState = (active: boolean) =>
  active
    ? 'border-fg bg-fg text-bg'
    : 'border-line text-muted hover:border-line-strong hover:text-fg'

/** Search, folders and the trash, above the library grid. */
export function LibraryToolbar({ view, folders, canEditFolders }: LibraryToolbarProps) {
  const t = useTranslations('library')
  const router = useRouter()
  const [query, setQuery] = useState(view.query ?? '')
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [hasError, setHasError] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const base = { workspaceId: view.workspaceId }
  const current = folders.find((f) => f.id === view.folder)

  async function run(action: () => Promise<unknown>, then?: string) {
    setHasError(false)
    try {
      await action()
      if (then) router.push(then)
      router.refresh()
    } catch {
      setHasError(true)
    }
  }

  function search(event: FormEvent) {
    event.preventDefault()
    router.push(libraryHref({ ...base, query: query.trim() || undefined }))
  }

  return (
    <div className="grid gap-3">
      <form role="search" onSubmit={search} className="relative">
        <label htmlFor="library-search" className="sr-only">
          {t('search')}
        </label>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" strokeLinecap="round" />
        </svg>
        <input
          id="library-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('search')}
          className="h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-sm"
        />
      </form>

      <nav
        aria-label={t('folders')}
        className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1"
      >
        <Link
          href={libraryHref(base)}
          className={`${chip} ${chipState(!view.folder && !view.trash && !view.query)}`}
        >
          {t('all')}
        </Link>
        <Link
          href={libraryHref({ ...base, folder: 'root' })}
          className={`${chip} ${chipState(view.folder === 'root' && !view.query)}`}
        >
          {t('unfiled')}
        </Link>
        {folders.map((folder) => (
          <Link
            key={folder.id}
            href={libraryHref({ ...base, folder: folder.id })}
            className={`${chip} ${chipState(view.folder === folder.id && !view.query)}`}
          >
            {folder.name}
          </Link>
        ))}
        {canEditFolders &&
          (isCreating ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  const folder = await createFolder(view.workspaceId ?? '', name)
                  setName('')
                  setIsCreating(false)
                  router.push(libraryHref({ ...base, folder: folder.id }))
                })
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onBlur={() => !name && setIsCreating(false)}
                onKeyDown={(e) => e.key === 'Escape' && setIsCreating(false)}
                aria-label={t('folderName')}
                placeholder={t('folderName')}
                maxLength={80}
                className="h-9 w-40 rounded-full border border-line-strong bg-surface px-3.5 text-sm"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className={`${chip} cursor-pointer border-dashed border-line-strong text-muted hover:text-fg`}
            >
              + {t('newFolder')}
            </button>
          ))}
        <Link
          href={libraryHref({ ...base, trash: true })}
          className={`${chip} ${chipState(Boolean(view.trash))} ml-auto`}
        >
          {t('trash')}
        </Link>
      </nav>

      {current && canEditFolders && !view.query && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {renaming !== null ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  await renameFolder(current.id, renaming)
                  setRenaming(null)
                })
              }}
            >
              <input
                autoFocus
                value={renaming}
                onChange={(e) => setRenaming(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                aria-label={t('folderName')}
                maxLength={80}
                className="h-8 rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-fg"
              />
            </form>
          ) : (
            <button
              type="button"
              className="cursor-pointer hover:text-fg"
              onClick={() => setRenaming(current.name)}
            >
              {t('renameFolder')}
            </button>
          )}
          <button
            type="button"
            className="cursor-pointer hover:text-danger"
            onClick={() => void run(() => deleteFolder(current.id), libraryHref(base))}
          >
            {t('deleteFolder')}
          </button>
          <span className="text-xs">{t('deleteFolderHint')}</span>
        </div>
      )}
      {hasError && (
        <p role="alert" className="text-sm text-danger">
          {t('error')}
        </p>
      )}
    </div>
  )
}
