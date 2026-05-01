import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getServerTrpc } from "@/lib/trpc-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function GifEmbedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trpc = await getServerTrpc();
  let gif;
  try {
    gif = await trpc.gifs.byId.query({ id });
  } catch {
    notFound();
  }
  if (gif.visibility === "private" || !gif.gifUrl) {
    notFound();
  }

  return (
    <div
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={gif.gifUrl}
        alt={gif.title}
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
