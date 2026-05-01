import "server-only";
import { headers } from "next/headers";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { getServerSession } from "next-auth";
import type { AppRouter } from "@repo/api";
import { authOptions } from "./auth";

const apiUrl = () =>
  `${process.env.NEST_URL ?? "http://localhost:4000"}/trpc`;

export async function getServerTrpc() {
  const session = await getServerSession(authOptions);
  // Forward the original client IP so the API's per-IP throttles and
  // anon-view counter operate on the visitor — not on the Next.js host.
  // Without this, every anonymous SSR request looks like one IP (the
  // Next process) and a single anon would burn the cap for everyone.
  const incoming = await headers();
  const cfIp = incoming.get("cf-connecting-ip");
  const xff = incoming.get("x-forwarded-for");
  const ua = incoming.get("user-agent");
  const referer = incoming.get("referer");
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: apiUrl(),
        async headers() {
          const h: Record<string, string> = {};
          if (session?.apiToken) h.Authorization = `Bearer ${session.apiToken}`;
          if (cfIp) h["cf-connecting-ip"] = cfIp;
          if (xff) h["x-forwarded-for"] = xff;
          if (ua) h["user-agent"] = ua;
          if (referer) h.referer = referer;
          return h;
        },
      }),
    ],
  });
}
