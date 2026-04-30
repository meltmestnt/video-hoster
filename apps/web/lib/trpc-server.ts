import "server-only";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { getServerSession } from "next-auth";
import type { AppRouter } from "@repo/api";
import { authOptions } from "./auth";

const apiUrl = () =>
  `${process.env.NEST_URL ?? "http://localhost:4000"}/trpc`;

export async function getServerTrpc() {
  const session = await getServerSession(authOptions);
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: apiUrl(),
        async headers() {
          if (session?.apiToken) {
            return { Authorization: `Bearer ${session.apiToken}` };
          }
          return {};
        },
      }),
    ],
  });
}
