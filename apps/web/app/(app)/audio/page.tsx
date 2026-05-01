import { Heading, Text } from "@radix-ui/themes";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { AudioLibrary } from "@/components/AudioLibrary";
import { T } from "@/lib/i18n";

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
          <T k="audio.lib.heading" />
        </Heading>
        <Text as="p" color="gray" size="2" mb="5">
          <T k="audio.lib.subtitle" />
        </Text>
      </div>
      <AudioLibrary initial={initial} />
    </>
  );
}
