import { createWorkspace, slugify, type Workspace } from '../domain/workspace'
import type { Clock, IdGenerator, WorkspaceRepository } from '../ports'

const MAX_SLUG_ATTEMPTS = 50

export interface CreateWorkspaceDeps {
  workspaces: WorkspaceRepository
  ids: IdGenerator
  clock: Clock
}

export interface CreateWorkspaceInput {
  ownerId: string
  name: string
}

export class CreateWorkspace {
  constructor(private readonly deps: CreateWorkspaceDeps) {}

  async execute(input: CreateWorkspaceInput): Promise<Workspace> {
    const id = this.deps.ids.next()
    const slug = await this.uniqueSlug(slugify(input.name), id)
    const workspace = createWorkspace({ id, name: input.name, slug, now: this.deps.clock.now() })

    await this.deps.workspaces.createWithMember(workspace, input.ownerId, 'owner')
    return workspace
  }

  private async uniqueSlug(base: string, id: string): Promise<string> {
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
      const candidate = attempt === 1 ? base : `${base}-${attempt}`
      if (!(await this.deps.workspaces.slugExists(candidate))) return candidate
    }
    return slugify(`${base}-${id}`)
  }
}
