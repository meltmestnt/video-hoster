import type { Metadata } from "next";
import Link from "next/link";
import { Box, Heading, Text } from "@radix-ui/themes";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What data vids&gifs collects, how we use it, and how to remove it.",
  alternates: { canonical: absoluteUrl("/privacy") },
};

export default function PrivacyPage() {
  return (
    <Box style={{ maxWidth: 720 }}>
      <Heading size="6" mb="2">
        Privacy
      </Heading>
      <Text as="p" color="gray" size="2" mb="5">
        Last updated: 2026-05-01
      </Text>

      <Heading size="3" mt="5" mb="2">
        What we collect
      </Heading>
      <Text as="p" mb="3">
        Account information you provide when signing up: name, email
        address, and (if you sign in with Google) profile picture. The
        content you upload — videos, GIFs, screenshots — along with any
        titles, descriptions, and tags you attach to it.
      </Text>
      <Text as="p" mb="3">
        If you accept the cookie banner, Google Analytics 4 collects
        anonymized usage data (page views, time on page, device type,
        approximate location). If you decline, no analytics scripts load
        and nothing is sent to Google. Strictly necessary authentication
        cookies are always set so you can stay signed in — these are
        exempt from consent under GDPR.
      </Text>

      <Heading size="3" mt="5" mb="2">
        How we use it
      </Heading>
      <Text as="p" mb="3">
        To run the service: storing and serving the content you upload,
        keeping private items visible only to their owner, and sending
        the occasional account email (sign-up confirmation, admin
        notifications about uploads). Aggregated analytics, if you
        consented, tell us which features are used so we can improve the
        site. We don&rsquo;t sell your data, share it with advertisers,
        or profile you for marketing.
      </Text>

      <Heading size="3" mt="5" mb="2">
        Your rights
      </Heading>
      <Text as="p" mb="3">
        You can delete your account at any time from the profile menu.
        Deleting an account also deletes every video, GIF, and
        screenshot you uploaded, both in our database and in object
        storage. To withdraw or change your analytics consent, use the
        Cookie settings link in the footer.
      </Text>

      <Heading size="3" mt="5" mb="2">
        Third parties
      </Heading>
      <Text as="p" mb="3">
        Hosting on Railway. Object storage on Amazon S3. Transactional
        email through Resend. Analytics — only if you consent — through
        Google Analytics 4. Each is bound by its own privacy policy; we
        only share data with them as needed to operate the service.
      </Text>

      <Heading size="3" mt="5" mb="2">
        Contact
      </Heading>
      <Text as="p" mb="3">
        For privacy questions, reach out at the email associated with
        this site&rsquo;s administrator. You can also revisit this page
        any time via the{" "}
        <Link
          href="/"
          style={{ color: "var(--accent-9)", textDecoration: "underline" }}
        >
          home page
        </Link>{" "}
        footer.
      </Text>
    </Box>
  );
}
