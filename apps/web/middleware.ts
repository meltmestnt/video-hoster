import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@/lib/i18n/locale";

// Honors `?lang=en` / `?lang=uk` so each locale has a stable URL Google
// can crawl independently. Without this, Googlebot only ever sees the
// English copy (it doesn't send Accept-Language), so the Ukrainian
// version never makes it into the index — and Russian/Ukrainian
// searchers see an English SERP snippet next to their Cyrillic UI.
//
// The override is forwarded to SSR via `x-locale-override` (so
// generateMetadata picks it up *on this request*) and persisted to the
// `vh.locale` cookie so subsequent navigations stay in the chosen
// locale without the query param.
export function middleware(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang");
  if (!lang || !(SUPPORTED_LOCALES as readonly string[]).includes(lang)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-locale-override", lang);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(LOCALE_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

export const config = {
  // Skip static assets, API routes, and metadata files — none of them
  // care about locale and matching them just adds latency.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|icon|apple-icon|opengraph-image).*)",
  ],
};
