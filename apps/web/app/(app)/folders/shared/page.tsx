import Link from "next/link";
import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { T } from "@/lib/i18n";
import { SharedFoldersClient } from "./SharedFoldersClient";

export const dynamic = "force-dynamic";

export default async function SharedFoldersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <>
        <div className="page-header">
          <Heading size="6" mb="1">
            <T k="sharedFolders.heading" />
          </Heading>
          <Text as="p" color="gray" size="2" mb="5">
            <T k="sharedFolders.subtitle" />
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
            <T k="sharedFolders.empty" />
          </Heading>
          <Button asChild>
            <Link href="/login">
              <T k="topbar.signIn" />
            </Link>
          </Button>
        </Box>
      </>
    );
  }

  const trpc = await getServerTrpc();
  const initial = await trpc.folders.listSharedWithMe.query();

  return (
    <>
      <div className="page-header">
        <Flex justify="between" align="start" gap="3" wrap="wrap" mb="1">
          <Box>
            <Heading size="6" mb="1">
              <T k="sharedFolders.heading" />
            </Heading>
            <Text as="p" color="gray" size="2">
              <T k="sharedFolders.subtitle" />
            </Text>
          </Box>
          <Box>
            <Link
              href="/folders"
              style={{
                color: "var(--gray-11)",
                fontSize: "var(--font-size-2)",
              }}
            >
              <T k="sharedFolders.linkBack" />
            </Link>
          </Box>
        </Flex>
      </div>
      <SharedFoldersClient initial={initial} />
    </>
  );
}
