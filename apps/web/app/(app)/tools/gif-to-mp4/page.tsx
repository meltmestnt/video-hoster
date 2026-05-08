import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  Box,
  Flex,
  Grid,
  Heading,
  Separator,
  Text,
} from "@radix-ui/themes";
import {
  ChatBubbleIcon,
  LightningBoltIcon,
  LockClosedIcon,
  PaperPlaneIcon,
  ShadowIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import { absoluteUrl } from "@/lib/site";
import { jsonLdScript } from "@/lib/seo";
import { GifToMp4Tool } from "@/components/GifToMp4Tool";

const PAGE_PATH = "/tools/gif-to-mp4";
const PAGE_URL = absoluteUrl(PAGE_PATH);

export const metadata: Metadata = {
  title: "GIF to MP4 converter — free, in-browser, no upload",
  description:
    "Convert GIF to MP4 instantly in your browser. No upload, no watermark, no signup. Powered by ffmpeg.wasm — your file never leaves your device.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    title: "GIF to MP4 converter — free, in-browser",
    description:
      "Drop a GIF, get an MP4. Runs entirely in your browser via ffmpeg.wasm — no upload, no signup, no watermark. Typically 5–20× smaller than the source GIF.",
    url: PAGE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "GIF to MP4 converter — free, in-browser",
    description:
      "Drop a GIF, get an MP4. Runs entirely in your browser — no upload, no signup.",
  },
};

interface ToolFaqEntry {
  question: string;
  answer: string;
}

const TOOL_FAQ: ToolFaqEntry[] = [
  {
    question: "Is the GIF to MP4 converter really free?",
    answer:
      "Yes. There's no signup, no watermark, no daily limit, and no paid tier on this tool. The entire conversion runs in your browser, so the only cost to anyone is your CPU. We don't show ads on this page.",
  },
  {
    question: "Does my GIF get uploaded anywhere?",
    answer:
      "No. The conversion happens locally inside your browser tab using ffmpeg.wasm — a WebAssembly build of the same ffmpeg used by professional video tooling. Your file is never uploaded, never copied to our servers, and never logged. You can verify by opening DevTools → Network and watching the conversion: there are no requests for your file.",
  },
  {
    question: "Why convert a GIF to MP4 in the first place?",
    answer:
      "MP4 is dramatically smaller (typically 5–20× smaller for the same clip), supports a full color palette instead of GIF's 256 colors, plays smoother on phones, and is what every modern messaging platform actually wants — Twitter/X, Telegram, Discord, WhatsApp and others all silently re-encode uploaded GIFs to MP4 anyway. Doing the conversion yourself means you keep control of the quality and the framerate.",
  },
  {
    question: "What's the maximum file size?",
    answer:
      "There's no hard cap, but in practice browsers struggle past ~100 MB because the entire file has to fit in WebAssembly memory. Most GIFs are small — the converter handles typical reaction GIFs (1–10 MB) instantly. Very long animations (10+ seconds at high resolution) may take a minute on slower laptops.",
  },
  {
    question: "Does the MP4 keep the audio from the GIF?",
    answer:
      "GIFs don't have audio — the format doesn't support an audio track at all. The MP4 we generate is silent, which is exactly what every chat app expects when you embed a converted GIF.",
  },
  {
    question: "Why does the first conversion take longer than the rest?",
    answer:
      "The first time you convert anything in this tab, the browser downloads about 25 MB of WebAssembly (the ffmpeg core). After that it's cached, and every subsequent conversion in the same session starts instantly. If you reload the page or open a private window, the download repeats.",
  },
  {
    question: "What resolution and codec does the output use?",
    answer:
      "The output is H.264 video at 480p with the +faststart flag, in an MP4 container. H.264 is the most universally compatible codec — every browser, phone, smart TV, and chat app supports it without plugins. 480p is high enough that GIF source detail is preserved (most GIFs are below 480p anyway) while keeping file size minimal.",
  },
  {
    question: "How does this compare to a server-side converter like ezgif?",
    answer:
      "Server-side converters require uploading your file, waiting in a queue, and downloading the result — three round trips that take longer than the actual conversion on a modern laptop. They also store your uploads (sometimes for days) and serve ads against them. Running the conversion in your browser skips all of that. The only thing you give up is the ability to convert files larger than your device can hold in memory.",
  },
  {
    question: "I want to do the reverse — MP4 to GIF. Where?",
    answer:
      "The home page at vidsandgifs.com has the in-browser MP4 → GIF converter front and center. Drop your video there and you'll get a GIF you can download or host with one click.",
  },
];

const HOW_TO_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to convert a GIF to MP4 in your browser",
  description:
    "Convert any GIF to an MP4 video file entirely in your web browser using ffmpeg.wasm. No upload, no signup, no software install.",
  totalTime: "PT30S",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Drop or pick your GIF",
      text: "Open vidsandgifs.com/tools/gif-to-mp4 and drag a .gif file onto the dropzone, or click to pick one from your computer. The tool reads the file locally — nothing is uploaded.",
      url: `${PAGE_URL}#step-1`,
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Wait for the encode",
      text: "ffmpeg.wasm runs an H.264 transcode in your browser tab. The first conversion downloads about 25 MB of WebAssembly; later conversions in the same session are instant.",
      url: `${PAGE_URL}#step-2`,
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Download the MP4",
      text: "Click 'Download MP4' to save the converted file. The output is silent 480p H.264 in an MP4 container — playable on every modern browser, phone, and chat app.",
      url: `${PAGE_URL}#step-3`,
    },
  ],
};

const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "vids&gifs GIF to MP4 converter",
  url: PAGE_URL,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any (browser-based)",
  browserRequirements:
    "Modern browser with JavaScript and WebAssembly enabled",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Convert GIF files to MP4 (H.264) entirely in the browser",
    "No file upload — privacy-preserving local conversion",
    "No signup, no watermark, no daily limit",
    "Silent MP4 output with +faststart for instant streaming",
  ],
};

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: TOOL_FAQ.map((entry) => ({
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
      name: "Tools",
      item: absoluteUrl("/tools/gif-to-mp4"),
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "GIF to MP4 converter",
      item: PAGE_URL,
    },
  ],
};

export default function GifToMp4Page() {
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
        <GifToMp4Tool />
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 1, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          Why convert GIFs to MP4?
        </Heading>
        <Text as="p" color="gray" size="3" mb="5" style={{ maxWidth: 700 }}>
          GIF is a 35-year-old image format that every chat app secretly
          re-encodes anyway. Converting yourself keeps you in control of the
          quality, the framerate, and the file you actually share.
        </Text>

        <Grid columns={{ initial: "1", sm: "3" }} gap="4">
          <BenefitCard
            Icon={StackIcon}
            title="5–20× smaller files"
            body="An H.264 MP4 of the same clip is dramatically smaller than the GIF source — friendlier on data plans, faster on bad Wi-Fi, and within message-size limits that GIFs blow past."
          />
          <BenefitCard
            Icon={LightningBoltIcon}
            title="Smoother playback"
            body="GIFs are capped at a 256-color palette and dither aggressively. MP4 keeps full color and plays at any framerate the source contains, without the banded look."
          />
          <BenefitCard
            Icon={LockClosedIcon}
            title="Privacy by default"
            body="The conversion runs in this browser tab using ffmpeg.wasm. Your GIF is never uploaded, never queued, never logged. Close the tab and nothing remains."
          />
        </Grid>
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 2, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          Where MP4 wins over GIF
        </Heading>
        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          <UseCaseCard
            Icon={PaperPlaneIcon}
            title="Telegram"
            body="Telegram silently converts every GIF you upload to MP4 before sending. Doing it yourself means the chat shows the version you chose, not the version Telegram's auto-encoder produced."
          />
          <UseCaseCard
            Icon={ChatBubbleIcon}
            title="Discord"
            body="Discord caps free-tier uploads at 25 MB per message. A 40 MB reaction GIF won't send — but the same clip as a 3 MB MP4 sails through, no Nitro required."
          />
          <UseCaseCard
            Icon={ShadowIcon}
            title="Twitter / X"
            body="X re-encodes uploaded GIFs to MP4 server-side and the result is often blocky. Uploading an MP4 directly skips the pipeline and preserves your original quality."
          />
          <UseCaseCard
            Icon={LightningBoltIcon}
            title="Web pages"
            body="Replacing autoplay GIFs with looping MP4s (loop muted playsinline) cuts page weight by 80–95%. Web Vitals scores notice; mobile users notice more."
          />
        </Grid>
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 3, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          Frequently asked questions
        </Heading>
        <Box style={{ maxWidth: 760 }}>
          {TOOL_FAQ.map((entry) => (
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
        style={{ ["--panel-index" as string]: 4, maxWidth: 760 }}
      >
        <Badge color="iris" variant="surface" radius="full">
          About vids&amp;gifs
        </Badge>
        <Heading as="h2" size="6" style={{ letterSpacing: "-0.02em" }}>
          One private library of GIFs and videos, sendable from every chat
        </Heading>
        <Text as="p" color="gray" size="3" style={{ lineHeight: 1.6 }}>
          This converter is a free side-tool. The main vids&amp;gifs product is
          a private, cross-chat library: upload your GIFs and short videos
          once, and send them inline from any Telegram chat
          (<strong>@vidsandgifsbot</strong>) or any Discord channel
          (<strong>/gif</strong>) — no copy-pasting links, no rebuilding folders
          per platform.
        </Text>
        <Flex gap="3" wrap="wrap" mt="2">
          <Link
            href="/"
            style={{
              color: "var(--accent-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            See how the cross-chat library works →
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
  Icon: typeof StackIcon;
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
