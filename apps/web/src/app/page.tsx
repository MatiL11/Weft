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
      <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4 sm:px-10">
        <Logo />
        <SignOutButton />
      </header>

      <main className="mx-auto max-w-5xl px-6 py-14 sm:px-10">
        {result.kind === 'error' ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-danger"
          >
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
    return <p className="text-ink-soft">You are not part of any workspace yet.</p>
  }

  return (
    <div className="rise">
      <p className="text-sm font-medium tracking-widest text-thread uppercase">Workspace</p>
      <h1 className="mt-2 font-display text-5xl tracking-tight">{current.workspace.name}</h1>
      <p className="mt-2 text-ink-soft">
        weft/<span className="text-ink">{current.workspace.slug}</span> · {current.role}
      </p>

      <section className="weave mt-12 grid place-items-center rounded-2xl border border-dashed border-ink/20 bg-paper-deep/60 px-6 py-20 text-center">
        <div className="max-w-sm">
          <h2 className="font-display text-2xl">No videos yet</h2>
          <p className="mt-2 text-ink-soft">
            Recording arrives in the next phase. When it does, your videos will be woven together
            right here.
          </p>
        </div>
      </section>

      {others.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-medium tracking-widest text-ink-soft uppercase">
            Other workspaces
          </h2>
          <ul className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
            {others.map((m) => (
              <li key={m.workspace.id} className="flex items-center justify-between py-3">
                <span>{m.workspace.name}</span>
                <span className="text-sm text-ink-soft">{m.role}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
