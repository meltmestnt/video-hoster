import type { Metadata } from "next";
import Link from "next/link";
import { Box, Heading, Text } from "@radix-ui/themes";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What data vids&gifs collects, how we use it, and how to remove it.",
  alternates: { canonical: absoluteUrl("/privacy") },
};

const LAST_UPDATED = "2026-05-01";

export default function PrivacyPage() {
  return (
    <Box style={{ maxWidth: 720 }}>
      <Heading size="6" mb="2">
        <T k="privacy.title" />
      </Heading>
      <Text as="p" color="gray" size="2" mb="5">
        <T k="privacy.lastUpdated" vars={{ date: LAST_UPDATED }} />
      </Text>

      <Heading size="3" mt="5" mb="2">
        <T k="privacy.collect.heading" />
      </Heading>
      <Text as="p" mb="3">
        <T k="privacy.collect.account" />
      </Text>
      <Text as="p" mb="3">
        <T k="privacy.collect.analytics" />
      </Text>

      <Heading size="3" mt="5" mb="2">
        <T k="privacy.use.heading" />
      </Heading>
      <Text as="p" mb="3">
        <T k="privacy.use.body" />
      </Text>

      <Heading size="3" mt="5" mb="2">
        <T k="privacy.rights.heading" />
      </Heading>
      <Text as="p" mb="3">
        <T k="privacy.rights.body" />
      </Text>

      <Heading size="3" mt="5" mb="2">
        <T k="privacy.thirdParties.heading" />
      </Heading>
      <Text as="p" mb="3">
        <T k="privacy.thirdParties.body" />
      </Text>

      <Heading size="3" mt="5" mb="2">
        <T k="privacy.contact.heading" />
      </Heading>
      <Text as="p" mb="3">
        <T k="privacy.contact.lead" />{" "}
        <Link
          href="/"
          style={{ color: "var(--accent-9)", textDecoration: "underline" }}
        >
          <T k="privacy.contact.homeLink" />
        </Link>
        <T k="privacy.contact.tail" />
      </Text>
    </Box>
  );
}
