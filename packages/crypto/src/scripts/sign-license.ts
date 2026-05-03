/**
 * Sign a deployment license with the Ed25519 private key.
 *
 * Usage:
 *   pnpm --filter @vidsandgifs/crypto sign-license --domain vidsandgifs.com
 *   pnpm --filter @vidsandgifs/crypto sign-license --domain localhost --dev
 *
 * Reads the private key from $VIDSANDGIFS_LICENSE_KEY_PATH (defaults
 * to ~/.vidsandgifs/license-key.pem). The key never lives in the
 * repo — generate once with:
 *
 *   openssl genpkey -algorithm ed25519 \
 *     -out ~/.vidsandgifs/license-key.pem
 *   openssl pkey -in ~/.vidsandgifs/license-key.pem \
 *     -pubout -out ~/.vidsandgifs/license-key.pub
 *
 * Then paste the contents of license-key.pub into VIDSANDGIFS_PUBLIC_KEY
 * inside apps/api/src/license/license.service.ts.
 *
 * Output format: `<base64url-payload>.<base64url-signature>` — paste
 * this into the VIDSANDGIFS_LICENSE env var on Railway (production) or
 * .env (local dev).
 */
import { createPrivateKey, sign as edSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface CliArgs {
  domain: string;
  keyPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  let domain: string | undefined;
  let keyPath =
    process.env.VIDSANDGIFS_LICENSE_KEY_PATH ??
    join(homedir(), ".vidsandgifs", "license-key.pem");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--domain") {
      const next = argv[++i];
      if (next) domain = next;
    } else if (arg === "--key") {
      const next = argv[++i];
      if (next) keyPath = next;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  if (!domain) {
    printHelp();
    process.exit(1);
  }
  return { domain, keyPath };
}

function printHelp(): void {
  // Direct stderr writes — `console.log` is a project-wide footgun
  // because the surrounding api silences it; this CLI runs standalone
  // so plain process.stdout / process.stderr are fine.
  process.stderr.write(`sign-license — mint a deployment license

Usage:
  sign-license --domain <hostname>            mint a license for <hostname>
  sign-license --domain <hostname> --key <p>  use a specific private key file

Examples:
  sign-license --domain vidsandgifs.com
  sign-license --domain localhost
  sign-license --domain staging.vidsandgifs.com

Output: paste the printed string into VIDSANDGIFS_LICENSE.
`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  let pem: string;
  try {
    pem = readFileSync(args.keyPath, "utf8");
  } catch (err) {
    process.stderr.write(
      `Could not read private key at ${args.keyPath}: ${(err as Error).message}\n`,
    );
    process.stderr.write(
      `Generate one with:\n  openssl genpkey -algorithm ed25519 -out ${args.keyPath}\n`,
    );
    process.exit(2);
  }
  const privateKey = createPrivateKey(pem);

  const payload = JSON.stringify({
    domain: args.domain,
    issuedAt: Math.floor(Date.now() / 1000),
  });
  const payloadBuf = Buffer.from(payload, "utf8");
  const payloadB64 = payloadBuf.toString("base64url");

  const signature = edSign(null, payloadBuf, privateKey);
  const sigB64 = signature.toString("base64url");

  // stdout = the license itself, nothing else, so callers can pipe it
  // straight into a clipboard tool or echo into an .env file.
  process.stdout.write(`${payloadB64}.${sigB64}\n`);
}

main();
