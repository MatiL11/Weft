import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/logo'
import { SignOutButton } from '@/components/sign-out-button'
import { fetchWorkspaces, type WorkspaceMembership } from '@/lib/workspaces'

export const dynamic = 'force-dynamic'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

export default async function DashboardPage() {
  const cookieHeader = (await cookies()).toString()
  const result = await fetchWorkspaces(API_INTERNAL_URL, cookieHeader)

  if (result.kind === 'unauthenticated') redirect('/sign-in')

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 sm:px-10">
          <Logo />
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-12 pb-20 sm:px-10">
        {result.kind === 'error' ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
            {result.message}
          </p>
        ) : (
          <WorkspaceOverview memberships={result.memberships} />
        )}
      </main>
    </div>
  )
}

function WorkspaceOverview({ memberships }: { memberships: WorkspaceMembership[] }) {
  const [current, ...others] = memberships

  if (!current) {
    return <p className="text-muted">You are not part of any workspace yet.</p>
  }

  return (
    <div className="rise grid gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="font-mono text-xs tracking-wider text-muted uppercase">
            weft/{current.workspace.slug} · {current.role}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {current.workspace.name}
          </h1>
        </div>
      </div>

      <section
        aria-labelledby="library-empty-title"
        className="grid gap-6 rounded-2xl border border-line bg-surface p-8 sm:grid-cols-[auto_1fr] sm:items-center sm:p-10"
      >
        <div className="grid size-16 place-items-center rounded-2xl bg-accent-soft">
          <span className="size-4 rounded-full bg-accent" />
        </div>
        <div className="grid max-w-xl gap-2">
          <h2 id="library-empty-title" className="text-xl font-semibold tracking-tight">
            Your library is empty
          </h2>
          <p className="text-muted">
            Recording arrives in the next release. Every video you record will show up here with its
            link, views and comments.
          </p>
        </div>
      </section>

      {others.length > 0 && (
        <section aria-labelledby="other-workspaces-title" className="grid gap-3">
          <h2 id="other-workspaces-title" className="text-sm font-medium text-muted">
            Other workspaces
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {others.map((m) => (
              <li key={m.workspace.id} className="flex items-center justify-between px-5 py-3.5">
                <span className="font-medium">{m.workspace.name}</span>
                <span className="font-mono text-xs text-muted">{m.role}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
