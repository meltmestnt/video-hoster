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
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/folders/${id}`)}`);
  }

  const viewerId = session.user.id;
  const trpc = await getServerTrpc();

  // The viewer either owns the folder OR is a recipient of a share. We
  // resolve via the two list endpoints rather than adding a getById
  // procedure — keeps the surface narrow and reuses the existing ACLs.
  const owned = await trpc.folders.list.query();
  let folderName: string | null = null;
  let ownerId: string = viewerId;
  let ownerName: string | null = null;
  const ownedFolder = owned.find((f) => f.id === id);
  if (ownedFolder) {
    folderName = ownedFolder.name;
    ownerId = viewerId;
  } else {
    const shared = await trpc.folders.listSharedWithMe.query();
    const sharedFolder = shared.find((f) => f.id === id);
    if (sharedFolder) {
      folderName = sharedFolder.name;
      ownerId = sharedFolder.owner.id;
      ownerName = sharedFolder.owner.name;
    }
  }
  if (!folderName) notFound();

  const initialGifs = await trpc.folders.listGifs.query({
    folderId: id,
    limit: 24,
  });

  const isOwner = ownerId === viewerId;

  return (
    <>
      <Box mb="3">
        <Link
          href={isOwner ? "/folders" : "/folders/shared"}
          style={{ color: "var(--gray-11)", fontSize: "var(--font-size-2)" }}
        >
          {isOwner ? (
            <T k="folders.detail.back" />
          ) : (
            <T k="sharedFolders.linkBack" />
          )}
        </Link>
      </Box>
      <FolderDetailClient
        folderId={id}
        initialName={folderName}
        initialGifs={initialGifs}
        isOwner={isOwner}
        ownerName={ownerName}
      />
    </>
  );
}
