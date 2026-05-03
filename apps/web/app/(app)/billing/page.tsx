import { notFound } from "next/navigation";

// Paid subscriptions (Lemon Squeezy) are paused — the page now 404s
// instead of trying to call trpc.billing.* which is no longer
// registered on the API. Restore the original implementation below
// when the Pro flow comes back.
export default function BillingPage() {
  notFound();
}

// ─── Original implementation (paused) ──────────────────────────────
// import { redirect } from "next/navigation";
// import { getServerSession } from "next-auth";
// import { Heading, Text } from "@radix-ui/themes";
// import { authOptions } from "@/lib/auth";
// import { getServerTrpc } from "@/lib/trpc-server";
// import { BillingPanel } from "@/components/BillingPanel";
// import { T } from "@/lib/i18n";
//
// export const dynamic = "force-dynamic";
//
// export default async function BillingPage() {
//   const session = await getServerSession(authOptions);
//   if (!session?.user) redirect("/login?callbackUrl=/billing");
//
//   const trpc = await getServerTrpc();
//   const me = await trpc.auth.me.query();
//   if (me?.role === "admin") redirect("/");
//
//   return (
//     <>
//       <div className="page-header">
//         <Heading size="6" mb="1">
//           <T k="billing.heading" />
//         </Heading>
//         <Text as="p" color="gray" size="2" mb="5">
//           <T k="billing.subtitle" />
//         </Text>
//       </div>
//       <BillingPanel />
//     </>
//   );
// }
