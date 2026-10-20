# Self-hosting Weft

Weft runs as a handful of containers on one machine: a small Caddy front door, the web app,
the API, a background worker, PostgreSQL and SeaweedFS (S3-compatible object storage). This guide covers a first
install, putting it on the internet behind HTTPS, configuration, backups and upgrades.

## Requirements

- Docker Engine with the Compose plugin (v2).
- An x86-64 machine. Released images are `linux/amd64`; on ARM, build from source (below).
- 2 CPU cores and 4 GB of RAM are enough for a small team. Rendering and transcription are
  CPU-bound: more cores make videos ready sooner, they don't change what viewers see while
  waiting (videos play from the first second).
- Disk for your videos. Each recording is kept as recorded plus its rendered versions
  (roughly twice the original size), and the worker needs about three times the size of the
  recording it is rendering as scratch space.

## Quick start (on your computer)

```bash
git clone https://github.com/MatiL11/Weft.git && cd Weft
cp .env.example .env
# Fill in the two secrets:
#   BETTER_AUTH_SECRET:   openssl rand -base64 48
#   S3_SECRET_ACCESS_KEY: openssl rand -hex 24
docker compose pull          # released images; or skip this and use `up --build` below
docker compose up -d
```

Open http://localhost:3000 and create an account: it gets a personal workspace. The first
start downloads the speech model (about 140 MB for the default `base`), so transcripts begin
a minute or two after the worker starts.

To build the images from your checkout instead of pulling them, run
`docker compose up -d --build`. If port 3000 or 8333 is taken, set `WEB_PORT` / `STORAGE_PORT`
(and update `PUBLIC_URL` / `STORAGE_PUBLIC_URL` to match).

## On the internet, with HTTPS

Browsers talk to two things: the web app (which also serves the API under `/api`) and the
object storage, because recordings are uploaded and streamed straight from it with short-lived
signed URLs. Give each its own hostname, e.g. `weft.example.com` and `media.example.com`, and
put a reverse proxy in front that terminates HTTPS.

Example with [Caddy](https://caddyserver.com) (it gets certificates automatically):

```caddyfile
weft.example.com {
	reverse_proxy 127.0.0.1:3000 {
		# Live comments use server-sent events: don't buffer them.
		flush_interval -1
	}
}

media.example.com {
	# Uploads are up to 64 MB per segment.
	request_body {
		max_size 100MB
	}
	reverse_proxy 127.0.0.1:8333
}
```

Then set in `.env`:

```bash
PUBLIC_URL=https://weft.example.com
STORAGE_PUBLIC_URL=https://media.example.com
# Only the reverse proxy should reach these ports.
WEB_PORT=127.0.0.1:3000
STORAGE_PORT=127.0.0.1:8333
# Let Weft's front door believe your proxy about the visitor's address (rate limits use it).
TRUSTED_PROXIES=private_ranges
```

and apply it with `docker compose up -d`.

Notes for other proxies (nginx, Traefik…):

- Keep the original `Host` header for the storage hostname: the signed URLs include it.
- Don't buffer responses on the web hostname (`proxy_buffering off` in nginx), or live
  comments arrive late.
- Allow request bodies of at least 64 MB on the storage hostname.
- Your proxy must send the visitor's address in `X-Forwarded-For` (all of them do by
  default). `TRUSTED_PROXIES` lists the addresses Weft accepts it from: `private_ranges`
  covers a proxy on the same machine or Docker network; otherwise give its IP or CIDR range.
  Left empty, every visitor looks like your proxy and they share one rate-limit bucket. Keep
  `WEB_PORT` bound to `127.0.0.1` (or firewalled) so only your proxy can reach it.

### Who can sign up

By default the first account can be created (that's you), and after that only people with a
pending invitation to a workspace can sign up, with the email they were invited at. Invite
people from the **Members** page. To let anyone who can open the site create an account,
set `OPEN_SIGNUP=true`.

## Configuration

Everything is set through `.env`, read by `docker-compose.yml`.

| Variable                 | Default                 | What it does                                                                                    |
| ------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`     | — (required)            | Signs sessions and video access tokens. At least 32 characters. Changing it signs everyone out. |
| `S3_SECRET_ACCESS_KEY`   | — (required)            | Secret of the storage account the services use.                                                 |
| `S3_ACCESS_KEY_ID`       | `weft`                  | Name of that storage account.                                                                   |
| `POSTGRES_PASSWORD`      | `weft`                  | Database password. The database isn't published outside Docker, but change it anyway.           |
| `PUBLIC_URL`             | `http://localhost:3000` | The address people open. Used for links in emails, oEmbed and cookie security.                  |
| `STORAGE_PUBLIC_URL`     | `http://localhost:8333` | The address browsers reach the storage at.                                                      |
| `WEB_PORT`               | `3000`                  | Host port (optionally `ip:port`) of the app (its front door).                                   |
| `STORAGE_PORT`           | `8333`                  | Host port (optionally `ip:port`) of the storage.                                                |
| `OPEN_SIGNUP`            | `false`                 | `true`: anyone can sign up. Otherwise only the first account and invited people.                |
| `TRUSTED_PROXIES`        | empty                   | Your reverse proxy's addresses (e.g. `private_ranges`), trusted to report visitors' IPs.        |
| `WEFT_VERSION`           | `latest`                | Image tag to pull, e.g. `0.1.0`. Pin it in production.                                          |
| `RENDER_CONCURRENCY`     | `1`                     | Videos rendered at once. Each render can use every core.                                        |
| `WHISPER_MODEL`          | `base`                  | Speech model: `tiny`, `base`, `small` or `medium` (more accurate, slower, bigger).              |
| `TRANSCRIBE_CONCURRENCY` | `1`                     | Videos transcribed at once.                                                                     |
| `SMTP_URL`               | empty (emails off)      | e.g. `smtps://user:pass@smtp.example.com:465`. Without it, emails are only logged.              |
| `MAIL_FROM`              | `Weft <weft@localhost>` | Sender of notification emails.                                                                  |

Emails go out for new comments and replies (at most one per video every 10 minutes),
invitations, and the first time each signed-in person watches your video each day.

Library search uses PostgreSQL's `unaccent` extension, which the migrations enable. If you
point the services at a managed database instead of the bundled one, it must allow it.

## Backups

Two things hold your data: the PostgreSQL database and the storage volume. The speech
models and render scratch space are rebuilt automatically.

```bash
# Database (consistent while running)
docker compose exec -T postgres pg_dump -U weft -Fc weft > weft-$(date +%F).dump

# Videos: stop the storage briefly so the copy is consistent
docker compose stop storage
docker run --rm -v weft_storage-data:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/weft-storage-$(date +%F).tar.gz -C /data .
docker compose start storage
```

Restore on a fresh install (same `.env`):

```bash
docker compose up -d postgres storage
docker compose stop storage
docker run --rm -v weft_storage-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/weft-storage-2026-10-20.tar.gz -C /data'
docker compose exec -T postgres pg_restore -U weft -d weft --clean --if-exists < weft-2026-10-20.dump
docker compose up -d
```

The volume names start with the Compose project name (`weft` unless you changed it); check
them with `docker volume ls`.

## Upgrades

Read the [release notes](https://github.com/MatiL11/Weft/releases) first, back up, then:

```bash
# with released images
sed -i 's/^WEFT_VERSION=.*/WEFT_VERSION=0.1.0/' .env   # the version you're moving to
docker compose pull && docker compose up -d

# or, from source
git pull && docker compose up -d --build
```

The API applies database migrations when it starts; the worker waits for it.

## Maintenance that runs by itself

Once a day the worker deletes videos that have been in the trash for 30 days and recordings
that were never finished (the browser was closed mid-upload) a day after they started. Their
files in storage go with them.

## Building for ARM or older CPUs

Build the images on the target machine with `docker compose up -d --build`. The worker
compiles whisper.cpp with AVX2 on x86-64; for CPUs without it, build with
`docker compose build --build-arg WHISPER_AVX2=OFF worker`.

## Troubleshooting

- **Uploads or playback fail with a network error.** Browsers can't reach
  `STORAGE_PUBLIC_URL`, or its value doesn't match the address they use. It must be reachable
  from viewers' machines, not just from the server.
- **Everyone gets "Too many attempts" when signing in.** `TRUSTED_PROXIES` doesn't include
  your reverse proxy's address.
- **Comments only show up after reloading.** Your reverse proxy buffers the web app's
  responses; turn buffering off for it.
- **No transcripts.** Check the worker log (`docker compose logs worker`): the speech model
  is downloaded on first start and needs internet access to Hugging Face once.
- **Logs**: `docker compose logs -f api worker web`.
