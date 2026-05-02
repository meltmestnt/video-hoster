// Shared between server and client: the only "use client" boundary in the
// i18n system is the React provider, so we keep plain values + types here so
// both `app/layout.tsx` (server) and `lib/i18n.tsx` (client) can import them
// without dragging server-only modules across the boundary.

export type Locale = "en" | "uk";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "uk"];

// Cookie that mirrors the user's chosen locale so the next SSR matches what
// the client picked. localStorage isn't visible to the server, so without
// this cookie a Ukrainian-speaking visitor would always get the default-
// language SSR HTML on the first paint and only swap to Ukrainian after
// hydration — bad both for UX (visible flash) and for Google (the indexer
// runs without JS, so it sees only the SSR copy).
export const LOCALE_COOKIE = "vh.locale";

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "uk";
}
