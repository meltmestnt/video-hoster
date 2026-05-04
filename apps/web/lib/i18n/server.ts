import "server-only";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "./locale";

// Resolves the locale to render with on the server. Order:
//   1. `x-locale-override` header — set by `middleware.ts` when the URL
//      starts with `/uk` (path-based locale prefix, the canonical SEO
//      form) or carries the legacy `?lang=<locale>` query param. Lets
//      Googlebot index a stable English URL ("/") and a stable
//      Ukrainian URL ("/uk") separately, so the SERP snippet matches
//      the user's locale.
//   2. `vh.locale` cookie — the user explicitly picked one via
//      LocaleSwitcher and we wrote it to a cookie so SSR matches
//      the client.
//   3. `Accept-Language` negotiation — first supported primary subtag wins
//      by q-weight. Lets visitors get content in their language on the
//      very first request, before any cookie exists.
//   4. English fallback — keeps SERP snippets and `<html lang>` consistent
//      for crawlers that don't send Accept-Language.
export async function getServerLocale(): Promise<Locale> {
  const headerStore = await headers();

  const fromHeader = headerStore.get("x-locale-override");
  if (isLocale(fromHeader)) return fromHeader;

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const acceptLanguage = headerStore.get("accept-language");
  if (acceptLanguage) {
    const negotiated = pickFromAcceptLanguage(acceptLanguage);
    if (negotiated) return negotiated;
  }
  return DEFAULT_LOCALE;
}

// Walk an Accept-Language header in q-weight order and return the first
// supported locale. Format per RFC 9110: comma-separated entries, optional
// `;q=N` (defaults to 1) — e.g. "uk-UA,uk;q=0.9,en;q=0.8". We only match on
// the primary subtag so "en-GB" picks `en`, "uk-UA" picks `uk`.
function pickFromAcceptLanguage(header: string): Locale | null {
  const tags = header
    .split(",")
    .map((entry) => {
      const [tagRaw, ...params] = entry.trim().split(";");
      let q = 1;
      for (const p of params) {
        const m = /^q=([0-9.]+)$/.exec(p.trim());
        if (m) q = Number.parseFloat(m[1]);
      }
      return { tag: tagRaw.trim().toLowerCase(), q };
    })
    .filter((t) => t.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    const primary = tag.split("-")[0];
    if (primary === "uk") return "uk";
    if (primary === "en") return "en";
  }
  return null;
}
