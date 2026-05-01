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

export type Locale = "en" | "uk";
export type TKey = keyof typeof en;

const DICTS: Record<Locale, Record<string, string>> = { en, uk };
const STORAGE_KEY = "vh.locale";
const DEFAULT: Locale = "uk";

function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "uk";
}

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

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT);

  // Read persisted locale on mount; SSR returns the default (en) so the
  // server-rendered HTML matches the client's first paint, then we swap.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(stored) && stored !== locale) setLocaleState(stored);
    } catch {
      // ignore (private mode, etc.)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect locale on <html lang> for accessibility tools and screen readers.
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
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      const dict = DICTS[locale] ?? DICTS[DEFAULT];
      const fallback = DICTS[DEFAULT];
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
      locale: DEFAULT,
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
