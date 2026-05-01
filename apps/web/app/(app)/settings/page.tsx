import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Heading, Text } from "@radix-ui/themes";
import { authOptions } from "@/lib/auth";
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
      <SettingsForm />
    </>
  );
}
