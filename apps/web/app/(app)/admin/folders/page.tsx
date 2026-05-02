import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Heading, Text } from "@radix-ui/themes";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { T } from "@/lib/i18n";
import { AdminFoldersClient } from "./AdminFoldersClient";

export const dynamic = "force-dynamic";

export default async function AdminFoldersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const trpc = await getServerTrpc();
  const me = await trpc.auth.me.query();
  if (!me || me.role !== "admin") {
    // Don't leak the page's existence — bounce non-admins to home, matching
    // the /manage pattern.
    redirect("/");
  }

  const initial = await trpc.admin.listFolders.query({ limit: 30 });

  return (
    <>
      <div className="page-header">
        <Heading size="6" mb="1">
          <T k="adminFolders.heading" />
        </Heading>
        <Text as="p" color="gray" size="2" mb="5">
          <T k="adminFolders.subtitle" />
        </Text>
      </div>
      <AdminFoldersClient initial={initial} />
    </>
  );
}
