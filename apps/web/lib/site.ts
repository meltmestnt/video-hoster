// Resolves the canonical site origin used for metadata, OG URLs, sitemap,
// and robots. Prefer NEXT_PUBLIC_SITE_URL in deployed environments; fall
// back to NEXTAUTH_URL (already required for auth callbacks) and finally
// to localhost for development.
export function siteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? null;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = siteUrl();
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
