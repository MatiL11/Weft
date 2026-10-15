import { DomainError } from './errors'

export const WORKSPACE_NAME_MAX_LENGTH = 64
export const WORKSPACE_SLUG_MAX_LENGTH = 48
const FALLBACK_SLUG = 'workspace'
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface Workspace {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly createdAt: Date
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface WorkspaceMembership {
  readonly workspace: Workspace
  readonly role: WorkspaceRole
}

export interface CreateWorkspaceProps {
  id: string
  name: string
  slug: string
  now: Date
}

/** Turns a display name into a URL-safe slug (lowercase ASCII, hyphen-separated). */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, WORKSPACE_SLUG_MAX_LENGTH)
    .replace(/-+$/, '')

  return slug.length > 0 ? slug : FALLBACK_SLUG
}

export function isValidSlug(slug: string): boolean {
  return slug.length <= WORKSPACE_SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug)
}

export function createWorkspace(props: CreateWorkspaceProps): Workspace {
  const name = props.name.trim()
  if (name.length === 0 || name.length > WORKSPACE_NAME_MAX_LENGTH) {
    throw new DomainError(
      'workspace.name_invalid',
      `Workspace name must be between 1 and ${WORKSPACE_NAME_MAX_LENGTH} characters.`,
    )
  }
  if (!isValidSlug(props.slug)) {
    throw new DomainError('workspace.slug_invalid', `Invalid workspace slug: "${props.slug}".`)
  }

  return { id: props.id, name, slug: props.slug, createdAt: props.now }
}
