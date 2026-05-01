import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Heading, Text } from "@radix-ui/themes";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { ManageUsersList } from "@/components/ManageUsersList";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const trpc = await getServerTrpc();
  const me = await trpc.auth.me.query();
  if (!me || me.role !== "admin") {
    // Don't leak the page's existence — bounce non-admins to home.
    redirect("/");
  }

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
