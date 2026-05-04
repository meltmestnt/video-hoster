import type { Metadata } from "next";
import Link from "next/link";
import { Box, Heading, Separator, Text } from "@radix-ui/themes";
import { absoluteUrl } from "@/lib/site";
import { jsonLdScript } from "@/lib/seo";
import {
  FAQ_ITEMS_EN,
  FAQ_ITEMS_UK,
  buildFaqJsonLd,
  type FaqEntry,
} from "@/lib/faq-data";

export const metadata: Metadata = {
  title:
    "FAQ — Send GIFs in Telegram + Discord, private folders, GIF ↔ MP4 conversion",
  description:
    "Answers to common questions about vids&gifs: how to send GIFs from your private library in any Telegram or Discord chat, what private folders are and how to share them, plus how to convert GIFs to MP4 (and vice versa) in your browser.",
  alternates: { canonical: absoluteUrl("/faq") },
  openGraph: {
    type: "website",
    title: "vids&gifs FAQ",
    description:
      "Sending GIFs from your private library in Telegram and Discord, private folders, and GIF ↔ MP4 conversion — all the common questions answered.",
    url: absoluteUrl("/faq"),
  },
};

export default function FaqPage() {
  // Combine both language sets into the same JSON-LD block so Google's
  // English and Ukrainian crawlers each find a matching Q/A entry.
  const jsonLd = buildFaqJsonLd([...FAQ_ITEMS_EN, ...FAQ_ITEMS_UK]);

  return (
    <Box style={{ maxWidth: 760 }}>
      {/* schema.org/FAQPage — Google parses this and may surface our
          questions as rich-result Q&A in search. The visible page below
          renders the *same* answer text verbatim, which the spec
          requires — hidden answers get the page demoted instead. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <Heading size="6" mb="2">
        Frequently asked questions
      </Heading>
      <Text as="p" color="gray" size="2" mb="6">
        Quick answers about uploading, converting, and sharing on vids&amp;gifs.
        Looking for something else? Try the{" "}
        <Link
          href="/"
          style={{ color: "var(--accent-9)", textDecoration: "underline" }}
        >
          home page
        </Link>
        .
      </Text>

      <FaqList items={FAQ_ITEMS_EN} />

      <Separator size="4" my="6" />

      <Heading size="4" mb="3" mt="4">
        Часті запитання (українською)
      </Heading>
      <FaqList items={FAQ_ITEMS_UK} />
    </Box>
  );
}

function FaqList({ items }: { items: FaqEntry[] }) {
  return (
    <Box>
      {items.map((entry) => (
        // <details>/<summary> gives us a free, accessible expand/collapse
        // and — importantly for SEO — Google's crawler sees both the
        // question and answer text in the rendered DOM regardless of
        // open state.
        <Box
          key={entry.question}
          asChild
          mb="3"
          style={{
            border: "1px solid var(--gray-4)",
            borderRadius: "var(--radius-3)",
            padding: "12px 16px",
            background: "var(--gray-1)",
          }}
        >
          <details>
            <summary
              style={{
                cursor: "pointer",
                fontSize: "var(--font-size-3)",
                fontWeight: 500,
                listStyle: "none",
              }}
            >
              {entry.question}
            </summary>
            <Box
              mt="2"
              style={{ color: "var(--gray-12)", lineHeight: 1.6 }}
              // Answers carry inline <strong>/<em>/<a>; both the visible
              // markup and the JSON-LD `text` field get the same string,
              // which is what Google's structured-data validator wants.
              dangerouslySetInnerHTML={{ __html: entry.answerHtml }}
            />
          </details>
        </Box>
      ))}
    </Box>
  );
}
