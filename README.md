# Denis's videos

Minimalist dark-themed video hosting platform. Sign in with Google, upload videos (up to 3 GiB), watch with comments and tag-based suggestions.

## Stack

- **Monorepo** — pnpm workspaces + Turborepo
- **Web** — Next.js 15 (App Router, SSR), Radix Themes (dark), NextAuth (Google), tRPC client, react-player
- **API** — NestJS 10, tRPC server, TypeORM + Postgres, AWS S3 (presigned PUT for uploads + GET for playback)
- **Shared** — `packages/shared`: zod schemas, constants
- **DB** — Postgres 16 via Docker Compose

## Prerequisites

- Node 20+
- pnpm 9+
- Docker (for Postgres)
- Google OAuth credentials ([Google Cloud Console](https://console.cloud.google.com/apis/credentials)) with `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI
- An AWS S3 bucket (private) with CORS configured to accept `PUT` and `GET` from `http://localhost:3000` (see below)

## Setup

```bash
# 1. Install
pnpm install

# 2. Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Generate a secret and use the same value in both files for NEXTAUTH_SECRET
openssl rand -base64 32

# 3. Start Postgres
docker compose up -d

# 4. Build the shared package once (api/web depend on its compiled output)
pnpm -F @repo/shared build

# 5. Run dev servers (web on :3000, api on :4000)
pnpm dev
```

The first time the api boots, TypeORM `synchronize` creates all tables.

## S3 bucket CORS

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

The bucket should remain private. Uploads use presigned PUT URLs; playback uses presigned GET URLs (1-hour TTL).

## Project layout

```
apps/
  api/              # NestJS + tRPC + TypeORM
  web/              # Next.js App Router
packages/
  shared/           # zod schemas + constants used by both apps
docker-compose.yml  # Postgres
turbo.json          # pipeline
```

## How upload works

1. User picks a video in the upload dialog. Client validates `file.size <= 3 GiB`.
2. `videos.createUpload` returns a presigned PUT URL plus the new video id.
3. Browser PUTs the video bytes directly to S3 (XHR with progress events).
4. `videos.finalizeUpload` HEADs the object, stores `sizeBytes`, flips status to `ready`, then runs the transcoder:
   - downloads the source from S3 to a temp file
   - probes duration, picks a random frame between 10% and 90% of duration
   - extracts the frame to a JPEG with `fluent-ffmpeg` (using `ffmpeg-static`)
   - uploads the JPEG to S3, creates a `Thumbnail` row
5. Dashboard query is invalidated; the new card appears with its thumbnail.

`TranscoderService.compressTo480p` is also wired (downloads source, encodes to 480p H.264 MP4, re-uploads), available for future use when you want a normalized playback variant.

The upload state lives in a global React Context (`UploadProvider`) so it survives navigation. The Upload button is disabled while a previous upload is in flight.

## Suggested videos

Tag-overlap query — the more tags shared with the current video, the higher it ranks. See `apps/api/src/videos/videos.service.ts#suggested`.

## Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run both apps in dev (after `pnpm -F @repo/shared build` once) |
| `pnpm build` | Build everything |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm db:up` / `pnpm db:down` | Start/stop Postgres |
