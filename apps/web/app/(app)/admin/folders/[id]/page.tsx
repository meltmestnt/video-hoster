import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Box } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { T } from "@/lib/i18n";
import { AdminFolderDetailClient } from "./AdminFolderDetailClient";

export const dynamic = "force-dynamic";

export default async function AdminFolderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const trpc = await getServerTrpc();
  const me = await trpc.auth.me.query();
  if (!me || me.role !== "admin") {
    redirect("/");
  }

  // Look up the folder via the admin index — gives us name + owner + counts
  // for the header without needing a dedicated single-folder admin endpoint.
  const list = await trpc.admin.listFolders.query({ limit: 100 });
  let folder = list.items.find((f) => f.id === id) ?? null;
  let cursor = list.nextCursor;
  while (!folder && cursor) {
    const next = await trpc.admin.listFolders.query({ limit: 100, cursor });
    folder = next.items.find((f) => f.id === id) ?? null;
    cursor = next.nextCursor;
  }
  if (!folder) notFound();

  const initialGifs = await trpc.admin.folderGifs.query({
    folderId: id,
    limit: 24,
  });

  return (
    <>
      <Box mb="3">
        <Link
          href="/admin/folders"
          style={{ color: "var(--gray-11)", fontSize: "var(--font-size-2)" }}
        >
          <T k="adminFolderDetail.back" />
        </Link>
      </Box>
      <AdminFolderDetailClient
        folderId={folder.id}
        initialName={folder.name}
        owner={folder.owner}
        gifCount={folder.gifCount}
        shareCount={folder.shareCount}
        initialGifs={initialGifs}
      />
    </>
  );
}
