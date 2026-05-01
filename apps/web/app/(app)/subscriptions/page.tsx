import { Heading, Text } from "@radix-ui/themes";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { SubscriptionsTabs } from "@/components/SubscriptionsTabs";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const trpc = await getServerTrpc();
  const [following, followers] = await Promise.all([
    trpc.subscriptions.following.query({ limit: 24 }),
    trpc.subscriptions.followers.query({ limit: 24 }),
  ]);

  return (
    <>
      <div className="page-header">
        <Heading size="6" mb="1">
          Subscriptions
        </Heading>
        <Text as="p" color="gray" size="2" mb="5">
          Creators you follow and the people following you.
        </Text>
      </div>
      <SubscriptionsTabs
        initialFollowing={following}
        initialFollowers={followers}
      />
    </>
  );
}
