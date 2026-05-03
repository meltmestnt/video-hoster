# @vidsandgifs/crypto

Private crypto helpers for vidsandgifs:

- HMAC sign/verify for media URLs (`MediaService.signUrl`/`verify`)
- Account-link token packing for the Telegram + Discord bots
- `sign-license` CLI for minting Ed25519-signed deployment licenses

Lives in this monorepo as a workspace package. The protection model assumes that **before the public repo goes public**, this package is moved to a separate private repository and published to a private registry (GitHub Packages is the obvious fit). Without registry credentials, `pnpm install` fails for anyone cloning the public repo.

## One-time setup

```bash
mkdir -p ~/.vidsandgifs
openssl genpkey -algorithm ed25519 -out ~/.vidsandgifs/license-key.pem
openssl pkey -in ~/.vidsandgifs/license-key.pem -pubout
```

Paste the printed public key (everything between `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----`, inclusive) into `VIDSANDGIFS_PUBLIC_KEY` in `apps/api/src/license/license.service.ts`. Commit that change. The private key stays on disk.

## Mint a license

```bash
# local dev
pnpm --filter @vidsandgifs/crypto sign-license --domain localhost

# production
pnpm --filter @vidsandgifs/crypto sign-license --domain vidsandgifs.com
```

Output is a single line — paste it into `VIDSANDGIFS_LICENSE` (in `.env` for local, in Railway → Variables for prod).

## Going-public migration (when you flip the public repo public)

1. Create a new private GitHub repo named `vidsandgifs-crypto`. Move the contents of `packages/crypto/` into it. Push.
2. Configure GitHub Packages publishing (`.npmrc` with `registry=https://npm.pkg.github.com` + `publishConfig`). Run `pnpm publish` once.
3. In the public repo, replace the workspace dependency:
   ```jsonc
   // apps/api/package.json
   "@vidsandgifs/crypto": "^0.0.1"  // was "workspace:*"
   ```
4. Add `.npmrc` at the public repo root:
   ```
   @vidsandgifs:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
   ```
5. On Railway → Variables, set `GITHUB_TOKEN` to a GitHub PAT with `read:packages` scope. Redeploy.
6. Delete `packages/crypto/` from the public repo.

After step 6, anyone cloning the public repo gets a `404 Not Found` from `npm.pkg.github.com` on `pnpm install` because they don't have your `GITHUB_TOKEN`. Combined with the Ed25519 license check (which requires your private key to satisfy in production), the bar to deploy a clone goes from "set env vars" to "rewrite the crypto layer + bypass the license check + maintain that fork forever."

## Why both layers?

- **Private package**: stops the casual clone — `pnpm install` fails before any code runs. Defeats lazy human cloners and AI agents that just try to deploy.
- **Ed25519 license check** (in the public repo): stops sophisticated cloners — even if they reimplement the package, the license-fingerprint binding means their re-signed URLs and link tokens use a different HMAC than yours, so all your existing cached URLs (Telegram inline picker, Discord embeds, browser caches) silently break for them. They need their own valid license, which requires your private key, which is uncomputable.

The public repo stays meaningful as a portfolio + legacy artifact. Anyone can read every line of the code, just not deploy it as their own brand.
