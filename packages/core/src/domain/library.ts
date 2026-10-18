/** The video library: folders, the trash and search. */
import { DomainError } from './errors'
import type { TranscriptSegment } from './transcript'

export const FOLDER_NAME_MAX_LENGTH = 80
/** Trashed videos are deleted for good after this long. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export interface Folder {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly createdBy: string
  readonly createdAt: Date
}

export function normalizeFolderName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length === 0 || name.length > FOLDER_NAME_MAX_LENGTH) {
    throw new DomainError(
      'folder.name_invalid',
      `Folder names must be between 1 and ${FOLDER_NAME_MAX_LENGTH} characters.`,
    )
  }
  return name
}

export const SEARCH_MAX_LENGTH = 100

/** Lowercase without accents: how searches compare text. */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ')
}

/** The first transcript line that mentions the query, to show where a search matched. */
export function findMatchingSegment(
  segments: readonly TranscriptSegment[],
  query: string,
): TranscriptSegment | null {
  const needle = foldForSearch(query.trim())
  if (!needle) return null
  return segments.find((s) => foldForSearch(s.text).includes(needle)) ?? null
}
