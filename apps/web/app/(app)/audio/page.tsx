import { Heading, Text } from "@radix-ui/themes";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { AudioLibrary } from "@/components/AudioLibrary";

export const dynamic = "force-dynamic";

export default async function AudioPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const trpc = await getServerTrpc();
  const initial = await trpc.audio.listMine.query();

  return (
    <>
      <div className="page-header">
        <Heading size="6" mb="1">
          Audio templates
        </Heading>
        <Text as="p" color="gray" size="2" mb="5">
          Upload audio you can layer on top of your videos. Each template stays
          in your library until you delete it.
        </Text>
      </div>
      <AudioLibrary initial={initial} />
    </>
  );
}
