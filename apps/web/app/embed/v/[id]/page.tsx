import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getServerTrpc } from "@/lib/trpc-server";

export const dynamic = "force-dynamic";

// Embed pages live outside the (app) segment so they bypass the topbar /
// footer / providers heavyweight tree — Twitter, Discord, and any other
// platform that loads us in an iframe gets just the player frame, no
// chrome. Indexing is also off; this page is meant to be embedded.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function VideoEmbedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trpc = await getServerTrpc();
  let video;
  try {
    video = await trpc.videos.byId.query({ id });
  } catch {
    notFound();
  }
  // Don't expose private uploads even when iframed — the API would have
  // rejected the byId for non-owners, but if an owner happens to share
  // their own embed link the iframe should still be a no-op for others.
  if (video.visibility === "private" || !video.videoUrl) {
    notFound();
  }

  return (
    <div
      // Mirrors the dark, contain-fit look of the main player frame at
      // /videos/[id] so the embed feels like the same surface — black
      // letterboxing, video centered, no chrome.
      style={{
        position: "fixed",
        inset: 0,
        margin: 0,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <video
        src={video.videoUrl}
        poster={video.thumbnailUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          background: "#000",
          display: "block",
        }}
      />
    </div>
  );
}
