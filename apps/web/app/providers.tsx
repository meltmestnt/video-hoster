"use client";

import { useEffect, useRef, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { UploadProvider } from "@/lib/upload-context";
import { MiniPlayerProvider } from "@/lib/mini-player-context";
import { I18nProvider } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/locale";
import { VerifyRequiredProvider } from "@/components/VerifyRequiredDialog";
import { ScrollLock } from "@/components/ScrollLock";

const apiUrl =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000") + "/trpc";

function TrpcProviders({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  // The trpc client is built once via useState; we route header lookups through
  // a ref so each request reads the live session, not the one captured at
  // mount time (which is null until next-auth finishes its first fetch).
  const tokenRef = useRef<string | undefined>(undefined);
  tokenRef.current = session?.apiToken;

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Trust cached data for 60s by default — quick back-and-forth
            // navigations between pages reuse already-fetched queries
            // instead of re-hitting the API. Per-query staleTime overrides
            // still apply: notifications.unreadCount uses 10s, byId uses 0
            // for the auth bootstrap gap, etc.
            staleTime: 60_000,
            // Don't refetch every time the tab refocuses — saves a flurry
            // of API calls every time the user alt-tabs back. Mutations
            // already invalidate the relevant queries, so this only
            // affects passive timeline drift, which 60s of staleness
            // covers anyway.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: apiUrl,
          headers() {
            const token = tokenRef.current;
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    }),
  );

  // The first time the API token becomes available (next-auth finishes its
  // async session fetch), refresh every cached query so anything fetched
  // anonymously during the bootstrap gap gets replaced with the authenticated
  // version.
  const tokenLoadedRef = useRef(false);
  useEffect(() => {
    if (session?.apiToken && !tokenLoadedRef.current) {
      tokenLoadedRef.current = true;
      queryClient.invalidateQueries();
    }
  }, [session?.apiToken, queryClient]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <VerifyRequiredProvider>
          <UploadProvider>
            <MiniPlayerProvider>
              <ScrollLock />
              {children}
            </MiniPlayerProvider>
          </UploadProvider>
        </VerifyRequiredProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  return (
    <SessionProvider>
      <I18nProvider initialLocale={initialLocale}>
        <TrpcProviders>{children}</TrpcProviders>
      </I18nProvider>
    </SessionProvider>
  );
}
