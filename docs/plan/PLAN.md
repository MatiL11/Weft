# Plan — Weft (MIT)

> Weft es una alternativa open source y self-hosteable a Loom.

> Estado: borrador v1 · 2026-10-15
> Decisiones: licencia **MIT** · backend **TypeScript** · MVP **grabar + link + colaboración** · despliegue **self-hosted primero, preparado para SaaS**.
> Investigación de piezas reutilizables: [docs/research/oss-landscape.md](../research/oss-landscape.md).

## 1. Principios

1. **Implementación propia.** Nunca se copia código de productos propietarios ni de proyectos con licencias incompatibles (por ejemplo, Cap es AGPL).
2. **Solo dependencias compatibles con MIT**: MIT, Apache-2.0, BSD, ISC o MPL-2.0 (si se usa sin modificar). Cada dependencia nueva se revisa en CI (`license-checker`).
3. **El link existe antes de grabar.** El video se crea en el servidor al apretar "Grabar", y la subida va en paralelo con la grabación.
4. **Multi-tenant desde el día uno.** Toda tabla de dominio lleva `workspace_id`. Self-hosted es "un tenant" y el SaaS usa la misma base de código.
5. **Pocas piezas para self-host**: Postgres + almacenamiento S3 + app. Sin Redis ni Kafka obligatorios.

## 2. Stack

| Capa             | Elección                                            | Por qué                                                             |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Monorepo         | pnpm workspaces + Turborepo                         | un solo lenguaje y tipos compartidos                                |
| Web app          | Next.js (App Router) + React + Tailwind             | SSR para las páginas `/share/:id` (OG tags, previews en Slack)      |
| API              | Hono (Node) + `@hono/zod-openapi`                   | liviano, OpenAPI generado, validación con Zod                       |
| Auth             | Better Auth (MIT)                                   | email/password, OAuth y orgs; self-hostable                         |
| DB               | PostgreSQL 16 + Drizzle ORM                         | migraciones tipadas                                                 |
| Cola de trabajos | pg-boss (sobre Postgres)                            | evita Redis en self-host                                            |
| Tiempo real      | WebSocket (Hono) + Postgres `LISTEN/NOTIFY`         | comentarios, reacciones y estado de procesamiento                   |
| Almacenamiento   | API S3: SeaweedFS (self-host) / R2 o S3 (nube)      | URLs prefirmadas                                                    |
| Captura          | `getDisplayMedia` + `getUserMedia`                  | estándar, funciona en Linux/Wayland vía portal                      |
| Codificación     | WebCodecs (H.264 + AAC/Opus) + Mediabunny (MPL-2.0) | segmentos fMP4 de unos 4 s. Si no hay WebCodecs: MediaRecorder WebM |
| Buffer local     | OPFS / IndexedDB                                    | reintentos y recuperación tras un crash                             |
| Procesamiento    | ffmpeg (proceso externo) en worker                  | HLS + MP4 faststart, miniaturas, sprite VTT                         |
| Transcripción    | whisper.cpp (servidor HTTP)                         | local, sin APIs pagas; intercambiable por API                       |
| Reproductor      | Video.js 10 + hls.js                                | HLS con MP4 de respaldo                                             |
| Tests            | Vitest + Playwright                                 | unit/integration + E2E del flujo grabar→ver                         |
| Deploy           | Docker Compose; imágenes en GHCR                    | `docker compose up` y listo                                         |

## 3. Arquitectura

```
 Navegador (grabador web)                     Servidor
 ┌──────────────────────────┐   POST /videos   ┌─────────────┐   ┌──────────┐
 │ getDisplayMedia + cam/mic│ ───────────────▶ │  API (Hono) │──▶│ Postgres │
 │ Canvas compositor (cam)  │ ◀── id + URLs ── │             │   └──────────┘
 │ WebCodecs → fMP4 4s segs │                  └─────┬───────┘        ▲
 │ OPFS buffer + reintentos │   PUT prefirmado        │ pg-boss        │
 └──────────┬───────────────┘ ───────────────▶ ┌──────▼─────┐   ┌──────┴──────┐
            │                                   │ S3 (Seaweed│◀──│ Worker      │
            │ POST /videos/:id/complete         │  /R2/S3)   │   │ ffmpeg,     │
            └──────────────────────────────────▶└────────────┘   │ whisper.cpp │
 Visor /share/:id ◀── HLS/MP4 (URL firmada) ──────────┘           └─────────────┘
        ▲  WS: comentarios, reacciones, estado de procesamiento
```

### Flujo de grabación

1. El usuario aprieta "Grabar". `POST /api/videos` crea el video (`status=recording`) y devuelve `videoId`, el link `/share/:id` y un _upload token_.
2. El encoder emite un segmento cada ~4 s, que se guarda en OPFS. Para subirlo se pide `POST /api/videos/:id/segments/:n/url` (URL prefirmada) y se hace un `PUT` a S3, con verificación MD5/SHA-256.
3. Pausa y reanudar: los segmentos siguen numerados; un manifiesto lleva las discontinuidades.
4. Al detener, `POST /api/videos/:id/complete` recibe la lista de segmentos y hashes. Si falta alguno, el cliente reintenta desde OPFS.
5. El worker une los segmentos y genera HLS (720p/1080p), MP4 faststart, poster, sprite + VTT de miniaturas y la transcripción (VTT + JSON). Avanza el estado `uploading → processing → ready`, y cada cambio se notifica por WS.
6. Mientras procesa, el visor ya puede reproducir los segmentos crudos con una playlist HLS provisoria. Así el link sirve al instante.

### Burbuja de cámara

- **MVP**: se compone en un `<canvas>` (pantalla + cámara circular en una esquina) y se codifica un solo stream. Funciona igual en cualquier navegador y SO.
- **Fase escritorio**: ventana flotante de la cámara (Electron) para que el presentador la vea.

### Clean Architecture (backend)

API y worker comparten un núcleo de dominio sin dependencias de frameworks. La regla de dependencias apunta siempre hacia adentro.

```
packages/
  core/                      ← dominio + casos de uso (TS puro, sin Hono/Drizzle/S3)
    domain/                  entidades y value objects: Video, Segment, Comment, Workspace,
                             VideoStatus (máquina de estados), Privacy, TimestampMs
    application/             casos de uso: StartRecording, RegisterSegment, CompleteRecording,
                             ProcessVideo, AddComment, RecordView, ChangePrivacy…
    ports/                   interfaces: VideoRepository, ObjectStorage, JobQueue,
                             Transcriber, MediaProcessor, EventBus, Clock, IdGenerator
  infra/                     ← adaptadores que implementan los ports
    db-drizzle/              repositorios Postgres
    storage-s3/              SeaweedFS / R2 / S3 (misma API)
    queue-pgboss/            JobQueue
    media-ffmpeg/            MediaProcessor
    transcriber-whisper/     Transcriber (whisper.cpp; otro adaptador para APIs)
    events-pg-notify/        EventBus para tiempo real
apps/
  api/                       ← entrega HTTP/WS: rutas Hono → casos de uso (solo mapeo + validación Zod)
  worker/                    ← entrega de jobs: pg-boss → casos de uso
  web/                       ← Next.js; organizado por features, no aplica capas de dominio
packages/recorder/           ← librería del grabador: núcleo puro (segmentación, cola de subida,
                             reintentos) + adaptadores de navegador (WebCodecs, MediaRecorder, OPFS)
```

- **Composición:** cada app tiene un `container.ts` que conecta los adaptadores con los casos de uso mediante inyección por constructor, sin frameworks de DI.
- **Tests:**
  - El dominio y los casos de uso se prueban con fakes en memoria de los ports: son rápidos y aportan casi toda la cobertura.
  - Los adaptadores se prueban con integration tests contra Postgres y SeaweedFS reales (Testcontainers).
- **Pragmatismo:** las lecturas simples (listados de biblioteca, analítica) pueden ir por _query services_ directos sobre Drizzle (estilo CQRS liviano), sin entidades de dominio. Solo las escrituras con reglas pasan por el dominio.
- **Lint:** `eslint-plugin-boundaries` (o dependency-cruiser) en CI impide que `core` importe de `infra` o `apps`.

## 4. Modelo de datos (MVP)

```
users(id, email, name, avatar_url, created_at)
workspaces(id, name, slug, plan, created_at)
memberships(workspace_id, user_id, role[owner|admin|member|viewer])
folders(id, workspace_id, parent_id, name, created_by)
videos(id, workspace_id, owner_id, folder_id, title, description,
       status[recording|uploading|processing|ready|failed],
       privacy[workspace|link|password|private], password_hash,
       duration_ms, width, height, storage_prefix,
       trim_ranges jsonb, created_at, updated_at, deleted_at)
video_segments(video_id, seq, bytes, sha256, uploaded_at)
video_assets(video_id, kind[hls|mp4|poster|sprite|captions|transcript], key, meta jsonb)
transcripts(video_id, lang, phrases jsonb[{start_ms,end_ms,text}], status)
comments(id, video_id, author_id, parent_id, body, timestamp_ms, created_at, edited_at, deleted_at)
reactions(id, video_id, user_id|anon_id, emoji, timestamp_ms, created_at)
views(id, video_id, viewer_id|anon_id, started_at, watched_ms, buckets bit(20), referrer)
share_links(id, video_id, token, expires_at)   -- para privacidad "link"
```

Todo se consulta filtrando por `workspace_id`. Los tiempos se guardan siempre en **ms enteros**.

## 5. API (REST + OpenAPI, primer corte)

| Método          | Ruta                                                  | Uso                                                     |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| POST            | `/api/videos`                                         | crear video y empezar sesión de grabación               |
| POST            | `/api/videos/:id/segments/:n/url`                     | URL prefirmada para un segmento                         |
| POST            | `/api/videos/:id/complete`                            | cerrar grabación y encolar procesamiento                |
| GET             | `/api/videos/:id`                                     | metadata + URLs firmadas (respeta privacidad/password)  |
| PATCH           | `/api/videos/:id`                                     | título, carpeta, privacidad, trim                       |
| GET             | `/api/videos?folder=&q=&cursor=`                      | biblioteca paginada                                     |
| GET/POST/DELETE | `/api/videos/:id/comments`                            | comentarios con timestamp                               |
| POST/DELETE     | `/api/videos/:id/reactions`                           | reacciones                                              |
| POST            | `/api/videos/:id/views` · `/views/:vid/progress`      | analítica (beacon)                                      |
| CRUD            | `/api/folders`, `/api/workspaces`, `/api/memberships` | organización                                            |
| WS              | `/ws?video=:id`                                       | `comment.*`, `reaction.*`, `video.status`, `view.count` |

Formato de respuesta: `{ data, error, meta }` en todas las rutas. Hay rate limiting en las rutas públicas (views, reactions anónimas, password).

## 6. Fases e hitos

Cada fase cierra con tests (≥80 % de cobertura en paquetes de dominio), revisión de código y demo.

### Fase 0 — Fundaciones (1 semana)

- [x] Monorepo: `apps/{web,api}`, `packages/core`, `packages/infra/db-drizzle` (el resto se crea cuando haga falta)
- [x] Regla de dependencias en CI (`core` no importa `infra` ni `apps`)
- [x] LICENSE MIT, README, CONTRIBUTING, CI (format, lint, typecheck, test, license-check, build de imágenes)
- [x] `docker-compose.yml`: postgres, api, web. **SeaweedFS pasa a la Fase 2, worker a la Fase 3 y whisper a la Fase 4**, que es donde se usan.
- [x] Drizzle: esquema inicial + migraciones; Better Auth + workspaces
- **Hito:** `docker compose up` → registrarse → workspace vacío. ✅ (verificado con la stack real en Docker)

### Fase 1 — Grabador web (2 semanas)

- [x] Selección de fuentes: pantalla/ventana/pestaña, cámara, micrófono, audio de la pestaña/sistema (si el navegador lo expone)
- [x] Compositor canvas con burbuja de cámara (posición y tamaño), modos pantalla+cam / solo pantalla / solo cam
- [x] Encoder WebCodecs → segmentos fMP4 ~4 s (Mediabunny; H.264/VP9/AV1 + AAC/Opus según el navegador)
- [ ] Fallback MediaRecorder para navegadores sin WebCodecs → **pospuesto**: Chrome, Edge, Firefox ≥130 y Safari ≥26 ya tienen WebCodecs; hoy esos navegadores ven un aviso claro
- [x] Cuenta regresiva, pausa/reanudar, descartar, grabar otra; límite de duración (60 min)
- [x] Buffer OPFS y recuperación de grabaciones interrumpidas
- [x] Tests: 47 de núcleo + 8 en Chromium real (validan el MP4 resultante) + E2E manual de `/record`
- **Hito:** grabar 10 min en Chrome y Firefox sobre CachyOS/Wayland y exportar un archivo local válido.
  - ✅ Verificado automáticamente en Chromium headless con dispositivos simulados.
  - ⏳ Pendiente: prueba manual con pantalla, cámara y micrófono reales en Chrome y Firefox sobre Wayland.

### Fase 2 — Subida en streaming + link instantáneo (1–2 semanas)

- [ ] Endpoints de video y segmentos, URLs prefirmadas, verificación de hash
- [ ] Cola de subida con reintentos y backoff; indicador de progreso
- [ ] Playlist HLS provisoria para reproducir antes del procesamiento
- **Hito:** al detener, el link copiado ya reproduce en otra pestaña en menos de 3 s.

### Fase 3 — Procesamiento + reproductor (2 semanas)

- [ ] Worker pg-boss: ensamblado, HLS 720/1080, MP4 faststart, poster, sprite VTT
- [ ] Página `/share/:id` SSR con OG tags; Video.js 10 + hls.js; velocidades 0.5–2.5×
- [ ] Embed `/embed/:id` con parámetros (`t`, `autoplay`, `muted`, `hide_title`…)
- [ ] Trim no destructivo (el reproductor salta rangos) + re-render en background
- [ ] Privacidad: workspace / link / password / privado
- **Hito:** video procesado con miniaturas al pasar el mouse, embebible en otro sitio.

### Fase 4 — Transcripción (1 semana)

- [ ] Worker whisper.cpp → transcripts (JSON) + captions (VTT); selección de idioma
- [ ] Panel de transcripción con click-to-seek y búsqueda
- **Hito:** subtítulos automáticos en español e inglés.

### Fase 5 — Colaboración (2 semanas)

- [ ] Comentarios con timestamp e hilos; marcadores en la barra de tiempo
- [ ] Reacciones con emoji en el timeline; anónimas con rate limit
- [ ] Tiempo real (WS + LISTEN/NOTIFY)
- [ ] Biblioteca: carpetas, búsqueda por título/transcripción, mover, borrar (papelera)
- [ ] Workspaces: invitaciones, roles, permisos
- [ ] Notificaciones por email (nuevo comentario/vista) — SMTP configurable
- **Hito:** dos usuarios comentan el mismo video y se ven en vivo.

### Fase 6 — Analítica básica (1 semana)

- [ ] Vistas (>1 s reproducido), visto completo/parcial (20 buckets), beacon al cerrar
- [ ] Panel del dueño: quién vio, cuánto, gráfico de retención
- **Hito:** retención visible por video.

### Fase 7 — Release self-host v0.1 (1 semana)

- [ ] Hardening: CSP, rate limits, límites de tamaño, auditoría de seguridad
- [ ] Docs de instalación (Docker, variables, backups), imágenes GHCR versionadas
- [ ] E2E Playwright: registro → grabar → compartir → comentar
- **Hito:** release `v0.1.0`.

**Total estimado MVP: ~11–13 semanas** (una persona a tiempo parcial puede duplicarlo).

### Post-MVP

- App de escritorio **Linux primero** (Electron): ventana flotante de cámara, atajos globales, captura vía portal.
- IA: capítulos y resumen automáticos (LLM configurable), eliminación de muletillas.
- Editor: cortes múltiples, unir clips, zoom automático.
- Extensión de navegador.
- SaaS: billing, cuotas por plan, R2 + CDN, observabilidad.

## 7. Riesgos

| Riesgo                                                                        | Mitigación                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| WebCodecs/H.264 no disponible en algunos Linux/Firefox                        | Detectar capacidades; fallback MediaRecorder WebM + transcodificación en worker |
| Audio del sistema en Linux (no lo expone `getDisplayMedia` fuera de pestañas) | Documentarlo; resolver en la app Electron (PipeWire)                            |
| Pérdida de datos si se cierra la pestaña                                      | OPFS + reanudar subida al volver                                                |
| Costo de transcodificación/almacenamiento en SaaS                             | Ladder mínimo (720p + original), políticas de retención                         |
| Contaminación de licencias                                                    | license-check en CI; prohibido copiar código de terceros incompatible           |
| Abuso de links públicos                                                       | Rate limit, URLs firmadas de corta duración, reportes                           |

## 8. Próximo paso

Ejecutar la **Fase 0**: crear el monorepo, compose, esquema de DB y auth.
