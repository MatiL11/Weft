# Weft

Open-source, self-hostable async video messaging: record your screen and camera,
get a shareable link instantly, and collect comments and reactions.

> Status: early development (Phase 5 — collaboration done). See [docs/plan/PLAN.md](docs/plan/PLAN.md).

## Stack

TypeScript monorepo (pnpm + Turborepo) · Next.js web app · Hono API · PostgreSQL + Drizzle ·
Better Auth · S3-compatible storage · pg-boss jobs · ffmpeg + whisper.cpp worker · Clean Architecture core.

## Repository layout

```
apps/
  api/        HTTP API (Hono) — delivery layer
  web/        Next.js web app
  worker/     background jobs: renders with ffmpeg, transcripts with whisper.cpp
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

When a recording ends, the `worker` service renders it with ffmpeg: an adaptive HLS ladder
(1080p/720p), a downloadable MP4, a poster and hover thumbnails. The video is watchable from the
first second; the render only improves it. Renders run one at a time by default
(`RENDER_CONCURRENCY`); each one can use every CPU core.

Each render is then transcribed on your server with [whisper.cpp](https://github.com/ggml-org/whisper.cpp):
viewers get captions and a searchable transcript. The speech model (`WHISPER_MODEL`: `tiny`, `base`
— the default —, `small` or `medium`) is downloaded once on the worker's first start and verified
against its published checksum. Bigger models are more accurate but slower. On x86-64 the worker
image uses AVX2; on older CPUs build it with `--build-arg WHISPER_AVX2=OFF`.

### Collaboration and email

Viewers comment at a moment of the video, reply in threads and react with emoji; everyone
watching sees it live. Workspace owners and admins invite people by link and manage roles.
Set `SMTP_URL` (e.g. `smtps://user:pass@smtp.example.com:465`) and `MAIL_FROM` to email people
about new comments, replies and invitations; to try it locally run
`docker compose --profile mail up` with `SMTP_URL=smtp://mailpit:1025` and open
http://localhost:8025.

Library search uses PostgreSQL's `unaccent` extension, which the migrations enable; a managed
database must allow it.

### Embedding

Every video has an embeddable player at `/embed/<id>` (options: `?t=90&autoplay=1&muted=1&hide_title=1`)
and an [oEmbed](https://oembed.com) endpoint at `/api/oembed?url=<share link>`, so links shared in
apps that support oEmbed unfurl as players. Only videos shared with "anyone with the link" embed.

## Development

Requirements: Node.js 24+, pnpm 11, Docker, ffmpeg (for the worker and its tests).

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## License

[MIT](LICENSE)
