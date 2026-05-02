"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en } from "./i18n/en";
import { uk } from "./i18n/uk";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "./i18n/locale";

export type { Locale };
export type TKey = keyof typeof en;

const DICTS: Record<Locale, Record<string, string>> = { en, uk };
const STORAGE_KEY = "vh.locale";

function format(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  // Seed from the server-detected locale so the SSR HTML and the first
  // client paint render in the same language — that's what Google indexes
  // and what users see before hydration.
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale ?? DEFAULT_LOCALE,
  );

  // One-shot migration for visitors who picked a locale in localStorage
  // before we started writing a cookie. If the cookie is empty but
  // localStorage has a valid value, copy it into the cookie so the next SSR
  // matches. Skip when the server already nailed the locale via cookie.
  useEffect(() => {
    try {
      const cookieAlreadySet = readCookie(LOCALE_COOKIE);
      if (cookieAlreadySet) return;
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(stored)) {
        writeCookie(LOCALE_COOKIE, stored);
        if (stored !== locale) setLocaleState(stored);
      }
    } catch {
      // ignore (private mode, blocked storage, etc.)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect locale on <html lang>. The server already sets it correctly on
  // first paint via getServerLocale(); this keeps it in sync if the user
  // toggles the switcher without reloading.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    writeCookie(LOCALE_COOKIE, next);
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      const dict = DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
      const fallback = DICTS[DEFAULT_LOCALE];
      const template = dict[key] ?? fallback[key] ?? key;
      return format(template, vars);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Outside the provider (rare), fall back to English so calls don't crash.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => format(en[key as TKey] ?? (key as string), vars),
    };
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}

export function useLocale() {
  return useI18n().locale;
}

export function useSetLocale() {
  return useI18n().setLocale;
}

/**
 * Renders a translated string. Use in server components — `<T>` itself is a
 * client component, so the locale is read at hydration time.
 */
export function T({
  k,
  vars,
}: {
  k: TKey;
  vars?: Record<string, string | number>;
}) {
  const t = useT();
  return <>{t(k, vars)}</>;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + escapeRegExp(name) + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  // 1 year — long enough that infrequent visitors keep their choice; short
  // enough that browsers will eventually drop it. Lax keeps the cookie on
  // top-level navigations (incl. inbound links from search) while blocking
  // it on cross-site POSTs we don't need anyway.
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
