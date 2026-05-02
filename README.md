# vids&gifs

> Drop a video in your browser, get a shareable GIF in 30 seconds. No upload, no install, no waiting room.

**Live:** [vidsandgifs.xyz](https://vidsandgifs.xyz)

A self-hosted video and GIF host that runs the heavy work — trimming, encoding, palette generation — entirely in your tab via `ffmpeg.wasm`. Your file never leaves the page until you choose to host it. Sign in once afterwards and the same converter mints a hotlinkable URL on `vidsandgifs.xyz`.

Plus a Telegram bot that puts your whole library one `@vidsandgifsbot` away from any chat: inline search to send your own GIFs without leaving Telegram, and forward-to-bot to upload new ones from your phone.

---

## What's interesting under the hood

- **Convert MP4 → GIF entirely client-side.** `ffmpeg.wasm` runs the trim + 480p encode locally; the only thing that crosses the network is the final hotlink-PUT to S3, and only if you sign in. A 60-second 1080p clip becomes a 480p loopable GIF in ~12s on a mid-tier laptop, with a live preview while it encodes.
- **Server-side URL ingest with serious SSRF guards.** Paste a `.gif` link and the server fetches it for you. The fetcher uses a custom `undici` Agent with a `connect.lookup` hook that re-validates every IP at every redirect — closes DNS rebinding, IPv4-mapped-IPv6 trickery, link-local (incl. AWS metadata), private ranges, and gzip-bomb amplification. ~470 lines of paranoid network code so that one feature can't become a portable port-scanner. See [`apps/api/src/s3/url-fetcher.ts`](apps/api/src/s3/url-fetcher.ts).
- **Telegram bot with full upload + inline search.** Connect once via a one-time deep-link token, then send any GIF to the bot to upload it, or `@vidsandgifsbot anything` in any chat to inline-search your library. Mpeg4-gif results so files >1MB still play; static JPEG thumbnails so Telegram's previewer never silently drops them.
- **Card-to-player morph navigation.** The thumbnail on the feed becomes the player frame on the detail page via a single conic-gradient overlay that re-uses the existing image — no double-fetch, no flash. Falls back gracefully if the destination's geometry can't be probed.
- **Type-safe across every boundary.** tRPC end-to-end, zod schemas in a shared workspace package, `force-dynamic` SSR pages that hand-shake auth via JWT-bridge tokens (issuer + audience pinned, signed with `NEXTAUTH_SECRET`).

## Stack

| Layer | What |
|---|---|
| Web | Next.js 15 App Router, Radix Themes, NextAuth (Google + credentials + One Tap), tRPC client, ffmpeg.wasm |
| API | NestJS 10, tRPC server, TypeORM + Postgres, S3 presigned PUT/GET, grammY for Telegram |
| Shared | `packages/shared` — zod schemas, limits, error prefixes |
| Infra | Railway (web + api + Postgres), AWS S3, Resend for email, Web Push (VAPID) |
| Build | pnpm workspaces + Turborepo |

## Architecture in 6 lines

```
Browser ──► Next.js (web) ──► tRPC ──► NestJS (api) ──► Postgres
   │             │                          │              │
   │             └──── NextAuth JWT ────────┘              │
   │                                                       │
   └────── Presigned PUT/GET (uploads, playback) ──► S3 ◄──┘
   │
   └──► Telegram bot ◄── grammY ── api (linked accounts only)
```

## Self-hosting

```bash
# 1. Install
pnpm install

# 2. Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Generate one secret and use the same value in BOTH files for
# NEXTAUTH_SECRET. The web mints JWTs with it; the api verifies
# them with it. Mismatch = login redirect loop.
openssl rand -base64 32

# 3. Start Postgres
docker compose up -d

# 4. Build the shared package once (api/web depend on its compiled dist)
pnpm -F @repo/shared build

# 5. Run dev servers (web on :3000, api on :4000)
pnpm dev
```

You'll need:
- Node 20+ and pnpm 9+
- Docker (for Postgres, or point `DATABASE_URL` at your own)
- An S3 bucket (private; CORS below) and AWS credentials
- Optional: Google OAuth credentials, Resend API key, Telegram bot token, VAPID keys for Web Push. Anything missing degrades gracefully — no Telegram token means the bot just doesn't run; no Resend means email confirmations are skipped (and surfaced as a warning rather than a hard failure).

### S3 CORS

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

The bucket stays private. Every served byte goes through `MediaController` with a signed-query-param URL (HMAC-SHA256 over `(kind, id, exp)`); the bucket itself is never addressable by clients. Hotlink protection on the cost-heavy kinds (video/gif/audio/mpeg4) lets known scrapers (Discord, Slack, Twitter, Telegram link previewers) through while blocking anonymous third-party embeds.

## Layout

```
apps/
  api/              NestJS + tRPC + TypeORM + Telegram bot
  web/              Next.js App Router, ffmpeg.wasm, NextAuth
packages/
  shared/           zod schemas, constants, error prefixes
docker-compose.yml  Postgres 16
turbo.json          dev/build/typecheck pipeline
```

## Built with Claude

This repo started as a weekend tinker and got pushed to production over a single Saturday with a lot of help from Claude. Nearly every commit message after the initial scaffold was generated by Claude; the SSRF guard, the morph animation, the Telegram inline-mode bridge, and most of the i18n were paired through long Claude sessions. The architecture decisions are mine, the code is co-authored, and the bugs are very much shared.

If you're curious what one developer + Claude can ship in a day, [the live site](https://vidsandgifs.xyz) is the answer. Clone it, run it locally, see what holds up.

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship a competitor, just don't blame me.
