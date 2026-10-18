/** Library view state, kept in the dashboard URL so it can be shared and navigated back to. */

export interface LibraryView {
  workspaceId?: string
  /** A folder id, 'root' for the top level, or undefined for every video. */
  folder?: string
  query?: string
  trash?: boolean
}

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined

export function parseLibraryView(
  params: Record<string, string | string[] | undefined>,
): LibraryView {
  const query = one(params.q)?.trim().slice(0, 100)
  return {
    workspaceId: one(params.workspace),
    folder: one(params.folder),
    query: query || undefined,
    trash: one(params.view) === 'trash',
  }
}

export function libraryHref(view: LibraryView): string {
  const params = new URLSearchParams()
  if (view.workspaceId) params.set('workspace', view.workspaceId)
  if (view.trash) params.set('view', 'trash')
  else {
    if (view.folder) params.set('folder', view.folder)
    if (view.query) params.set('q', view.query)
  }
  const query = params.toString()
  return query ? `/?${query}` : '/'
}

/** Query string for GET /api/videos. */
export function videoListQuery(view: LibraryView): string {
  const params = new URLSearchParams()
  if (view.workspaceId) params.set('workspaceId', view.workspaceId)
  if (view.trash) params.set('trash', '1')
  else if (view.query) params.set('q', view.query)
  else if (view.folder) params.set('folderId', view.folder)
  return params.toString()
}
