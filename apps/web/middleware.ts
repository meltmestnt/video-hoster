import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@/lib/i18n/locale";

// Locale routing. Two surfaces:
//
//   1. **Path-based prefix** (`/uk`, `/uk/...`) — the canonical SEO form.
//      Google treats path-based locale URLs as fully distinct documents
//      instead of variants of one canonical, which is the recommendation
//      in https://developers.google.com/search/docs/specialized/international/localized-versions.
//      We rewrite the request internally to the underlying route while
//      preserving the visible URL, so /uk/foo serves the same page as
//      /foo with the locale fixed to Ukrainian.
//   2. **Legacy query param** (`?lang=uk`) — kept working so existing
//      bookmarks and shared links don't break. New canonical/hreflang
//      declarations no longer point at this form, so Google will phase
//      it out of the index naturally.
//
// In both cases the chosen locale is forwarded to SSR via
// `x-locale-override` (so `generateMetadata` picks it up *on this
// request*) and persisted to the `vh.locale` cookie so subsequent
// in-app navigations stay in the chosen language without a path prefix.

// Match `/uk` exactly and `/uk/<rest>` (rest captured for the rewrite).
// Anchored so `/ukulele` doesn't accidentally match.
const UK_PREFIX_RE = /^\/uk(\/.*)?$/;

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  const ukMatch = UK_PREFIX_RE.exec(url.pathname);
  if (ukMatch) {
    return rewriteWithLocale(req, "uk", ukMatch[1] || "/");
  }

  const lang = url.searchParams.get("lang");
  if (lang && (SUPPORTED_LOCALES as readonly string[]).includes(lang)) {
    return passthroughWithLocale(req, lang);
  }

  return NextResponse.next();
}

function rewriteWithLocale(
  req: NextRequest,
  locale: string,
  rewrittenPath: string,
) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-locale-override", locale);

  const target = req.nextUrl.clone();
  target.pathname = rewrittenPath;

  const response = NextResponse.rewrite(target, {
    request: { headers: requestHeaders },
  });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

function passthroughWithLocale(req: NextRequest, locale: string) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-locale-override", locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

export const config = {
  // Skip static assets, API routes, and metadata files — none of them
  // care about locale and matching them just adds latency. The /uk
  // rewrite covers /uk/<route> only; static assets always live at the
  // unprefixed path so we don't need to handle /uk/_next/* or similar.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|icon|apple-icon|opengraph-image).*)",
  ],
};
