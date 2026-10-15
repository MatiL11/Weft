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

## Self-hosting (Docker)

```bash
cp .env.example .env
# set BETTER_AUTH_SECRET (openssl rand -base64 48) and S3_SECRET_ACCESS_KEY (openssl rand -hex 24)
docker compose up --build
```

Open http://localhost:3000, create an account, and you'll land in your personal workspace.
Use `WEB_PORT=3100 PUBLIC_URL=http://localhost:3100 docker compose up` if port 3000 is taken.

Videos are stored in SeaweedFS (S3-compatible). Browsers upload and stream media directly from
it through short-lived presigned URLs, so its port (8333 by default) must be reachable by viewers.
In production, put it behind your domain and set `STORAGE_PUBLIC_URL` (e.g. `https://media.example.com`).

## Development

Requirements: Node.js 24+, pnpm 11, Docker.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## License

[MIT](LICENSE)
