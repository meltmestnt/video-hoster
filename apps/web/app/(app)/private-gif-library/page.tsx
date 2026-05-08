import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Separator,
  Text,
} from "@radix-ui/themes";
import {
  ArchiveIcon,
  ChatBubbleIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MixIcon,
  PaperPlaneIcon,
  Share1Icon,
} from "@radix-ui/react-icons";
import { absoluteUrl } from "@/lib/site";
import { jsonLdScript } from "@/lib/seo";
import { AnonChatLibraryHero } from "@/components/AnonChatLibraryHero";

const PAGE_PATH = "/private-gif-library";
const PAGE_URL = absoluteUrl(PAGE_PATH);

export const metadata: Metadata = {
  title:
    "Private GIF library — one shared library across Telegram and Discord",
  description:
    "Build a private library of GIFs and videos and send them inline from any Telegram or Discord chat — same folder, same search, every chat. Free.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    title: "Private GIF library — one library, every chat (Telegram + Discord)",
    description:
      "Upload your GIFs and videos once. Send them inline from any Telegram chat (@vidsandgifsbot) or Discord channel (/gif). Private folders, scoped search, instant sharing.",
    url: PAGE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Private GIF library — one library, every chat",
    description:
      "Upload your GIFs once. Send them inline from any Telegram or Discord chat. Free.",
  },
};

interface FaqEntry {
  question: string;
  answer: string;
}

const FAQ: FaqEntry[] = [
  {
    question: "What is a private GIF library?",
    answer:
      "A private library is a personal collection of GIFs and short videos that only you can see and search. Unlike Tenor or Giphy — which serve everyone the same public catalog — a private library contains exactly the reactions, jokes, and clips you've curated. On vids&gifs your library lives in folders you control, and the same library powers the Telegram inline picker and the Discord /gif autocomplete, so you don't have to maintain a separate set per platform.",
  },
  {
    question: "How is this different from Telegram's built-in GIF saved list?",
    answer:
      "Telegram's saved-GIF list is per-account, lives only inside Telegram, and has no folders, no search beyond filename, and no way to share it with a friend. Your vids&gifs library is folder-based (you can keep separate sets for separate chats), tag-searchable, and accessible from a website, Telegram, and Discord with the same data backing all three. If you switch phones or sign in on a new device, everything is still there — and you can grant a friend read-only access to a folder so they can use your collection without rebuilding it themselves.",
  },
  {
    question: "How do I send GIFs inline in Telegram?",
    answer:
      "Connect your Telegram account once in Settings → Connections, then in any chat type @vidsandgifsbot followed by a search term. Telegram's native inline picker pops up a grid of GIFs from your active folder — tap one and it sends instantly. Forwarding any GIF to the bot adds it to that same folder, so your library grows from inside the chat.",
  },
  {
    question: "How do I send GIFs inline in Discord?",
    answer:
      "Add the vids&gifs Discord bot to your server (or use it in a DM), connect your account in Settings → Connections, and type /gif. Discord's slash-command autocomplete shows GIFs from your active folder as you type — pick one and the bot posts it to the channel. Use /upload-file to add a new GIF straight from Discord; it lands in your active folder and stays searchable on the website too.",
  },
  {
    question: "What's an active folder, and why does it matter?",
    answer:
      "You can keep multiple folders (work GIFs, friends GIFs, a specific group joke, etc.) and pick one as 'active' at any time. The active folder is the search scope for the Telegram inline picker and the Discord /gif autocomplete. So when you switch from a work chat to a friends chat, you flip your active folder once on the website, and both bots immediately start surfacing the right set of reactions.",
  },
  {
    question: "Can I share a folder with friends?",
    answer:
      "Yes. Open any folder and hit Share — that produces a read-only link. Anyone with the link sees your folder live as you add to it, with no copies and no manual sync. Their copy stays in sync automatically. Great for a friend group that wants a shared reaction library curated by one person.",
  },
  {
    question: "Is my library actually private?",
    answer:
      "Yes. Your folders default to private — only you and accounts you've explicitly shared a folder with can see what's inside. Uploading something to your library does not publish it. The only way a GIF becomes public is if you manually flip the visibility on the upload itself.",
  },
  {
    question: "Is this free?",
    answer:
      "Yes. Building folders, connecting Telegram and Discord, sending inline GIFs, sharing folders, and uploading new media all work on the free tier. A paid Pro tier exists for higher daily upload quotas, but every cross-chat library feature is on the free plan with no advertising.",
  },
  {
    question: "What if I just want to convert a GIF to MP4 (or back)?",
    answer:
      "We have free standalone tools for that — no signup needed. Use the GIF → MP4 converter at vidsandgifs.com/tools/gif-to-mp4 or the MP4 → GIF converter at vidsandgifs.com/tools/mp4-to-gif. Both run entirely in your browser via ffmpeg.wasm; the file never leaves your device.",
  },
];

const HOW_TO_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to set up a private GIF library across Telegram and Discord",
  description:
    "Sign up for vids&gifs, connect Telegram and Discord, upload your GIFs into folders, and send them inline from any chat with @vidsandgifsbot or /gif.",
  totalTime: "PT5M",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Create a free account",
      text: "Sign up at vidsandgifs.com/signup. No credit card required — every cross-chat library feature is on the free plan.",
      url: absoluteUrl("/signup"),
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Upload your GIFs into folders",
      text: "Drag GIFs and short videos into the dashboard. Group them into folders by theme — work, friends, a specific group chat — and pick one as your 'active' folder.",
      url: absoluteUrl("/folders"),
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Connect Telegram",
      text: "In Settings → Connections, link @vidsandgifsbot to your account. From any Telegram chat type '@vidsandgifsbot search-term' to inline-pick a GIF from your active folder.",
      url: absoluteUrl("/settings"),
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Connect Discord",
      text: "Add the vids&gifs Discord bot to your server (or DM it) and link your account. Use /gif to autocomplete from your active folder, or /upload-file to add new media without leaving Discord.",
      url: absoluteUrl("/settings"),
    },
  ],
};

const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "vids&gifs — private GIF library for Telegram and Discord",
  url: PAGE_URL,
  applicationCategory: "CommunicationApplication",
  operatingSystem: "Any (browser-based + Telegram bot + Discord bot)",
  browserRequirements:
    "Modern browser with JavaScript enabled; Telegram and/or Discord account for inline use",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Private GIF and video library, organized into folders",
    "Inline GIF picker in Telegram via @vidsandgifsbot",
    "Inline GIF autocomplete in Discord via /gif slash command",
    "Read-only folder sharing with live updates",
    "Tag-based search, scoped to your active folder",
    "Forward any GIF to the bot to add it to your active folder",
  ],
};

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((entry) => ({
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: entry.answer,
    },
  })),
};

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "vids&gifs",
      item: absoluteUrl("/"),
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Private GIF library",
      item: PAGE_URL,
    },
  ],
};

export default function PrivateGifLibraryPage() {
  return (
    <Box>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(HOW_TO_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(APP_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(FAQ_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(BREADCRUMB_JSON_LD) }}
      />

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 0 }}
      >
        <AnonChatLibraryHero />
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 1, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          One library, every chat — that's the whole point
        </Heading>
        <Text as="p" color="gray" size="3" mb="5" style={{ maxWidth: 720 }}>
          Tenor and Giphy serve everyone the same public catalog. Telegram's
          saved-GIF list lives only inside Telegram. Your vids&amp;gifs
          library is yours, organized into folders, and the same data backs
          inline pickers in both Telegram and Discord — no copies, no
          per-platform rebuilds.
        </Text>

        <Grid columns={{ initial: "1", sm: "3" }} gap="4">
          <BenefitCard
            Icon={ArchiveIcon}
            title="Private folders"
            body="Group GIFs and videos by theme — work, friends, a specific group joke. The 'active' folder you pick on the website is exactly what the bots search inside."
          />
          <BenefitCard
            Icon={MagnifyingGlassIcon}
            title="Scoped search"
            body="Tag-based search runs against your folder, not a public catalog. Type three letters in the Telegram inline picker; the right reaction is one tap away."
          />
          <BenefitCard
            Icon={Share1Icon}
            title="Read-only sharing"
            body="Send a friend a share link to a folder. They see your collection live as you add to it, no copies and no manual sync. Perfect for a curated group library."
          />
        </Grid>
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 2, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          How it works in each chat
        </Heading>
        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          <ChatCard
            Icon={PaperPlaneIcon}
            title="Telegram"
            body={[
              "In any chat, type @vidsandgifsbot followed by a search term.",
              "Telegram's native inline picker shows a grid of GIFs from your active folder.",
              "Tap one — it sends instantly, sourced from your private library, not Tenor.",
              "Forward any GIF to the bot to add it to your active folder.",
            ]}
          />
          <ChatCard
            Icon={ChatBubbleIcon}
            title="Discord"
            body={[
              "Add the vids&gifs bot to your server (or use it in a DM).",
              "Type /gif and start typing a search term — slash autocomplete shows your folder.",
              "Pick one and the bot posts it to the channel.",
              "Use /upload-file to add a new GIF without leaving Discord.",
            ]}
          />
        </Grid>
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 3, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          What you get on the free tier
        </Heading>
        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          <UseCaseCard
            Icon={LockClosedIcon}
            title="Private by default"
            body="Folders are private until you explicitly share them. Uploading a GIF doesn't publish it — your library is yours."
          />
          <UseCaseCard
            Icon={MixIcon}
            title="Auto-file from chats"
            body="Forward any GIF to @vidsandgifsbot or use Discord's /upload-file. The clip lands in your active folder and is searchable from every chat in seconds."
          />
          <UseCaseCard
            Icon={MagnifyingGlassIcon}
            title="Tag and search"
            body="Tag GIFs once and the bots match against tags, not just filename. Three-letter searches in the inline picker hit the right clip the first time."
          />
          <UseCaseCard
            Icon={Share1Icon}
            title="Read-only share links"
            body="Hand a friend a link and they get live read-only access to a folder — the bots search through their account but find your set."
          />
        </Grid>
      </div>

      <Flex
        direction="column"
        gap="3"
        align="center"
        className="intro-panel-fade-up"
        style={{
          ["--panel-index" as string]: 4,
          padding: "32px 24px",
          borderRadius: "var(--radius-4)",
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(70, 132, 255, 0.18) 0%, transparent 70%), " +
            "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
          border: "1px solid var(--gray-5)",
          marginBottom: 32,
        }}
      >
        <Heading as="h2" size="6" align="center" style={{ letterSpacing: "-0.02em" }}>
          Build your library in 5 minutes
        </Heading>
        <Text as="p" color="gray" size="3" align="center" style={{ maxWidth: 560 }}>
          Sign up, drag a few GIFs in, connect Telegram and Discord, and the
          inline picker is yours in every chat. No payment information, no
          mandatory plan.
        </Text>
        <Flex gap="3" wrap="wrap" justify="center" mt="2">
          <Button asChild size="3" variant="solid" color="iris">
            <Link href="/signup">Create a free account</Link>
          </Button>
          <Button asChild size="3" variant="soft" color="gray">
            <Link href="/login">Sign in</Link>
          </Button>
        </Flex>
      </Flex>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 5, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          Frequently asked questions
        </Heading>
        <Box style={{ maxWidth: 760 }}>
          {FAQ.map((entry) => (
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
                <Text
                  as="p"
                  size="2"
                  mt="2"
                  style={{ color: "var(--gray-12)", lineHeight: 1.6 }}
                >
                  {entry.answer}
                </Text>
              </details>
            </Box>
          ))}
        </Box>
      </div>

      <Separator size="4" my="6" />

      <Flex
        direction="column"
        gap="3"
        align="start"
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 6, maxWidth: 760 }}
      >
        <Badge color="iris" variant="surface" radius="full">
          More
        </Badge>
        <Heading as="h2" size="6" style={{ letterSpacing: "-0.02em" }}>
          Free side-tools
        </Heading>
        <Text as="p" color="gray" size="3" style={{ lineHeight: 1.6 }}>
          Need to convert a clip before you upload it to your library? We have
          two free standalone converters that run entirely in your browser —
          no signup, no upload.
        </Text>
        <Flex gap="3" wrap="wrap" mt="2">
          <Link
            href="/tools/gif-to-mp4"
            style={{
              color: "var(--accent-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            GIF → MP4 converter →
          </Link>
          <Link
            href="/tools/mp4-to-gif"
            style={{
              color: "var(--accent-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            MP4 → GIF converter →
          </Link>
          <Link
            href="/faq"
            style={{
              color: "var(--gray-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            Read the full FAQ
          </Link>
        </Flex>
      </Flex>
    </Box>
  );
}

function BenefitCard({
  Icon,
  title,
  body,
}: {
  Icon: typeof ArchiveIcon;
  title: string;
  body: string;
}) {
  return (
    <Box
      style={{
        padding: "20px",
        borderRadius: "var(--radius-4)",
        border: "1px solid var(--gray-5)",
        background:
          "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
        height: "100%",
      }}
    >
      <Box
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background:
            "linear-gradient(135deg, var(--iris-4) 0%, var(--blue-4) 100%)",
          color: "var(--iris-11)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 0 0 1px var(--iris-6)",
          marginBottom: 12,
        }}
      >
        <Icon width="18" height="18" />
      </Box>
      <Heading as="h3" size="4" mb="2" style={{ letterSpacing: "-0.01em" }}>
        {title}
      </Heading>
      <Text as="p" size="2" color="gray" style={{ lineHeight: 1.55 }}>
        {body}
      </Text>
    </Box>
  );
}

function ChatCard({
  Icon,
  title,
  body,
}: {
  Icon: typeof PaperPlaneIcon;
  title: string;
  body: string[];
}) {
  return (
    <Box
      style={{
        padding: "24px",
        borderRadius: "var(--radius-4)",
        border: "1px solid var(--gray-5)",
        background:
          "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
      }}
    >
      <Flex align="center" gap="3" mb="3">
        <Box
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--accent-4)",
            color: "var(--accent-11)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon width="20" height="20" />
        </Box>
        <Heading as="h3" size="5" style={{ letterSpacing: "-0.01em" }}>
          {title}
        </Heading>
      </Flex>
      <Box
        asChild
        style={{
          color: "var(--gray-11)",
          fontSize: "var(--font-size-2)",
          lineHeight: 1.7,
          paddingLeft: 18,
        }}
      >
        <ol>
          {body.map((line, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              {line}
            </li>
          ))}
        </ol>
      </Box>
    </Box>
  );
}

function UseCaseCard({
  Icon,
  title,
  body,
}: {
  Icon: typeof PaperPlaneIcon;
  title: string;
  body: string;
}) {
  return (
    <Flex
      gap="3"
      align="start"
      style={{
        padding: "16px 18px",
        borderRadius: "var(--radius-3)",
        border: "1px solid var(--gray-5)",
        background: "var(--gray-2)",
      }}
    >
      <Box
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          flexShrink: 0,
          background: "var(--accent-4)",
          color: "var(--accent-11)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon width="16" height="16" />
      </Box>
      <Box style={{ minWidth: 0 }}>
        <Heading as="h3" size="3" mb="1" style={{ letterSpacing: "-0.01em" }}>
          {title}
        </Heading>
        <Text as="p" size="2" color="gray" style={{ lineHeight: 1.55 }}>
          {body}
        </Text>
      </Box>
    </Flex>
  );
}
