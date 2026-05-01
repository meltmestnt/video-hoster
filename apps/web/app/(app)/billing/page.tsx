import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Heading, Text } from "@radix-ui/themes";
import { authOptions } from "@/lib/auth";
import { BillingPanel } from "@/components/BillingPanel";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/billing");

  return (
    <>
      <div className="page-header">
        <Heading size="6" mb="1">
          <T k="billing.heading" />
        </Heading>
        <Text as="p" color="gray" size="2" mb="5">
          <T k="billing.subtitle" />
        </Text>
      </div>
      <BillingPanel />
    </>
  );
}
