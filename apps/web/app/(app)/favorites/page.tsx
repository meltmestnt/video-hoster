import { Heading, Text } from "@radix-ui/themes";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { FavoritesList } from "@/components/FavoritesList";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const trpc = await getServerTrpc();
  const initial = await trpc.videos.favorites.query({ limit: 24 });

  return (
    <>
      <div className="page-header">
        <Heading size="6" mb="1">
          <T k="page.favorites.heading" />
        </Heading>
        <Text as="p" color="gray" size="2" mb="5">
          <T k="page.favorites.subtitle" />
        </Text>
      </div>
      <FavoritesList initial={initial} />
    </>
  );
}
