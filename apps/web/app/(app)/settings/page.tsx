import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Heading, Text } from "@radix-ui/themes";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { SettingsForm } from "@/components/SettingsForm";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = {
  // No reason to surface an account-only settings page in search.
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=/settings");
  }
  // Pre-resolve the user's preferences server-side so SettingsForm's
  // very first render already reflects the DB state. Without this the
  // toggles flash to their defaults for ~100 ms while the client tRPC
  // query catches up — which users perceive as "I disabled it but it
  // came back on" after a reload.
  const trpc = await getServerTrpc();
  const me = await trpc.auth.me.query();
  return (
    <>
      <div className="page-header">
        <Heading size="6" mb="1">
          <T k="settings.heading" />
        </Heading>
        <Text as="p" color="gray" size="2" mb="5">
          <T k="settings.subtitle" />
        </Text>
      </div>
      <SettingsForm
        initialMiniPlayerEnabled={me?.miniPlayerEnabled ?? true}
        initialNotifySubscribersOnUpload={me?.notifySubscribersOnUpload ?? true}
      />
    </>
  );
}
