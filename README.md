# Weft

Open-source, self-hostable async video messaging: record your screen and camera,
get a shareable link instantly, and collect comments and reactions.

> Status: early development (Phase 0 — foundations). See [docs/plan/PLAN.md](docs/plan/PLAN.md).

## Stack

TypeScript monorepo (pnpm + Turborepo) · Next.js web app · Hono API · PostgreSQL + Drizzle ·
Better Auth · S3-compatible storage · Clean Architecture core.

## Repository layout

```
apps/
  api/        HTTP API (Hono) — delivery layer
  web/        Next.js web app
packages/
  core/       domain + use cases + ports (framework-free)
  infra/*     adapters implementing core ports (Postgres, S3, …)
```

## Development

Requirements: Node.js 24+, pnpm 11, Docker.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## License

[MIT](LICENSE)
