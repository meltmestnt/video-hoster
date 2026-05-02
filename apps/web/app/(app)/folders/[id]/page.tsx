import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Box } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { T } from "@/lib/i18n";
import { FolderDetailClient } from "./FolderDetailClient";

export const dynamic = "force-dynamic";

export default async function FolderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  // The detail page is meaningful only to the owner — anon viewers can't
  // see anyone else's folders, so push them straight to login rather than
  // rendering an empty shell.
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/folders/${id}`)}`);
  }

  const trpc = await getServerTrpc();
  const folders = await trpc.folders.list.query();
  const folder = folders.find((f) => f.id === id);
  if (!folder) notFound();

  const initialGifs = await trpc.folders.listGifs.query({
    folderId: id,
    limit: 24,
  });

  return (
    <>
      <Box mb="3">
        <Link
          href="/folders"
          style={{ color: "var(--gray-11)", fontSize: "var(--font-size-2)" }}
        >
          <T k="folders.detail.back" />
        </Link>
      </Box>
      <FolderDetailClient
        folderId={folder.id}
        initialName={folder.name}
        initialGifs={initialGifs}
      />
    </>
  );
}
