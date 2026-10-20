# Changelog

All notable changes to Weft are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-20

The first release: a self-hostable way to record your screen and camera and share a link the
moment you stop.

### Recording and sharing

- Record screen and camera, screen only or camera only, in the browser, with a movable camera
  bubble, microphone and tab audio, countdown, pause and a 60-minute limit.
- The recording uploads while you record; the link is ready (and copied) as soon as you stop,
  and people can even watch while you're still recording.
- Interrupted recordings are kept in the browser and can be downloaded afterwards.

### Watching

- Adaptive HLS playback (1080p/720p), a downloadable MP4, poster and hover thumbnails,
  rendered on your server with ffmpeg. Videos play from the first second.
- A custom player with speeds, keyboard shortcuts, captions and full screen.
- Non-destructive trimming of the start and end.
- Privacy per video: anyone with the link, the workspace, a password, or only you.
- An embeddable player and an oEmbed endpoint.

### Transcripts

- Automatic transcripts and captions in the spoken language, made on your server with
  whisper.cpp. The transcript is searchable, and clicking a line jumps to that moment.

### Collaboration

- Comments at a moment of the video, one-level threads, emoji reactions, all live for
  everyone watching.
- Workspaces with roles (owner, admin, member, viewer) and invitations by link.
- A library with folders, a trash (emptied after 30 days), and search across titles and what
  is said in videos.
- Email notifications for comments, replies, invitations and views, in each person's
  language.

### Analytics

- Views, unique viewers, average watched, completion, an audience retention chart, and who
  watched (when signed in).

### Self-hosting

- One `docker compose` stack with a Caddy front door, PostgreSQL, SeaweedFS, the API, the web
  app and the worker. Images are published for `linux/amd64`. See the
  [self-hosting guide](docs/self-hosting.md).
- Sign-up is invite-only by default (`OPEN_SIGNUP=true` opens it).
- A nonce-based Content-Security-Policy, rate limits that can't be dodged with a forged
  `X-Forwarded-For`, and secrets left at their example values are refused at startup.
- English and Spanish interface.

### Known limitations

- Only the start and end of a video can be trimmed.
- There are no per-user storage quotas yet; keep sign-up invite-only on public servers.
- Email addresses aren't verified.
- Signed media links already handed out stay valid for up to an hour after a video becomes
  private or is trashed.
- ARM images aren't published; build them from source.

[0.1.0]: https://github.com/MatiL11/Weft/releases/tag/v0.1.0
