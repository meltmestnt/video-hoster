import { redirect } from "next/navigation";
import { Heading, Text } from "@radix-ui/themes";
import { getMe, getServerTrpc, getSession } from "@/lib/trpc-server";
import { ManageUsersList } from "@/components/ManageUsersList";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  // getMe() is React-cached and the (app) layout already fetched it —
  // this is a same-request cache hit, no extra tRPC round-trip.
  const me = await getMe();
  if (!me || me.role !== "admin") {
    // Don't leak the page's existence — bounce non-admins to home.
    redirect("/");
  }

  const trpc = await getServerTrpc();
  const initial = await trpc.admin.listUsers.query({ limit: 50 });

  return (
    <>
      <div className="page-header">
        <Heading size="6" mb="1">
          <T k="manage.heading" />
        </Heading>
        <Text as="p" color="gray" size="2" mb="5">
          <T k="manage.subtitle" />
        </Text>
      </div>
      <ManageUsersList initial={initial} myId={me.id} />
    </>
  );
}
