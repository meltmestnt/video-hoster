"use client";

import { useEffect, useRef, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { UploadProvider } from "@/lib/upload-context";
import { MiniPlayerProvider } from "@/lib/mini-player-context";

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
            // Trust SSR-provided data for a few seconds so the first
            // refetch-on-mount (which fires before useSession resolves and
            // would otherwise hit the API anonymously) doesn't clobber
            // server-rendered, authenticated results.
            staleTime: 10_000,
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
        <UploadProvider>
          <MiniPlayerProvider>{children}</MiniPlayerProvider>
        </UploadProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TrpcProviders>{children}</TrpcProviders>
    </SessionProvider>
  );
}
