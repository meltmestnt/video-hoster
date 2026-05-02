import Link from "next/link";
import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { T } from "@/lib/i18n";
import { FoldersClient } from "./FoldersClient";

export const dynamic = "force-dynamic";

export default async function FoldersPage() {
  const session = await getServerSession(authOptions);
  // Render an inline sign-in nudge for anon viewers instead of redirecting
  // — folders are deeply tied to a user, so the empty-state framing reads
  // better than bouncing them to /login.
  if (!session?.user) {
    return (
      <>
        <div className="page-header">
          <Heading size="6" mb="1">
            <T k="folders.heading.title" />
          </Heading>
          <Text as="p" color="gray" size="2" mb="5">
            <T k="folders.heading.subtitle" />
          </Text>
        </div>
        <Box
          style={{
            padding: "64px 24px",
            background: "var(--gray-2)",
            borderRadius: "var(--radius-3)",
            border: "1px dashed var(--gray-5)",
            textAlign: "center",
          }}
        >
          <Heading size="4" mb="2">
            <T k="folders.empty.title" />
          </Heading>
          <Text as="p" color="gray" size="2" mb="4">
            <T k="gifCard.menu.addToFolder.signInRequired" />
          </Text>
          <Button asChild>
            <Link href="/login">
              <T k="folders.empty.cta" />
            </Link>
          </Button>
        </Box>
      </>
    );
  }

  const trpc = await getServerTrpc();
  const initial = await trpc.folders.list.query();

  return (
    <>
      <div className="page-header">
        <Flex justify="between" align="start" gap="3" wrap="wrap" mb="1">
          <Box>
            <Heading size="6" mb="1">
              <T k="folders.heading.title" />
            </Heading>
            <Text as="p" color="gray" size="2">
              <T k="folders.heading.subtitle" />
            </Text>
          </Box>
          {/* The actual button lives in FoldersClient because it owns the
              create-dialog state — this column is just visual scaffolding
              so the heading and CTA share a row when there's room. */}
        </Flex>
      </div>
      <FoldersClient initial={initial} />
    </>
  );
}
