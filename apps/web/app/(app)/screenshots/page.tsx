import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerTrpc } from "@/lib/trpc-server";
import { ScreenshotCard } from "@/components/ScreenshotCard";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Screenshots",
  description:
    "Frames captured from videos and GIFs on Video Hoster.",
  alternates: { canonical: absoluteUrl("/screenshots") },
  // Personal artifacts: don't index by default.
  robots: { index: false, follow: false },
};

export default async function ScreenshotsPage() {
  const trpc = await getServerTrpc();
  const result = await trpc.screenshots.list.query({ limit: 24 });

  return (
    <>
      <div className="page-header">
        <Flex align="end" justify="between" gap="3" wrap="wrap" mb="5">
          <div>
            <Heading size="6" mb="1">
              <T k="screenshots.page.title" />
            </Heading>
            <Text as="p" color="gray" size="2">
              <T k="screenshots.page.subtitle" />
            </Text>
          </div>
        </Flex>
      </div>

      {result.items.length === 0 ? (
        <Flex
          align="center"
          justify="center"
          style={{
            padding: "64px 24px",
            background: "var(--gray-2)",
            borderRadius: "var(--radius-3)",
            border: "1px dashed var(--gray-5)",
          }}
        >
          <Text color="gray">
            <T k="screenshots.empty" />
          </Text>
        </Flex>
      ) : (
        <div className="dashboard-grid">
          {result.items.map((s, i) => (
            <ScreenshotCard key={s.id} shot={s} index={i} />
          ))}
        </div>
      )}
    </>
  );
}
