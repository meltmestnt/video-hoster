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
  CodeIcon,
  EnvelopeClosedIcon,
  LightningBoltIcon,
  LockClosedIcon,
  PaperPlaneIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import { absoluteUrl } from "@/lib/site";
import { jsonLdScript } from "@/lib/seo";
import { Mp4ToGifTool } from "@/components/Mp4ToGifTool";

const PAGE_PATH = "/tools/mp4-to-gif";
const PAGE_URL = absoluteUrl(PAGE_PATH);

export const metadata: Metadata = {
  title: "MP4 to GIF converter — free, in-browser, no upload",
  description:
    "Convert MP4 (or MOV / WebM / MKV) to animated GIF instantly in your browser. No upload, no watermark, no signup. Powered by ffmpeg.wasm — your file never leaves your device.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    title: "MP4 to GIF converter — free, in-browser",
    description:
      "Drop a video, get a GIF. Two-pass palette-optimized encode entirely in your browser via ffmpeg.wasm — no upload, no signup, no watermark.",
    url: PAGE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "MP4 to GIF converter — free, in-browser",
    description:
      "Drop a video, get a GIF. Runs entirely in your browser — no upload, no signup.",
  },
};

interface ToolFaqEntry {
  question: string;
  answer: string;
}

const TOOL_FAQ: ToolFaqEntry[] = [
  {
    question: "Is the MP4 to GIF converter really free?",
    answer:
      "Yes. There's no signup, no watermark, no daily limit, and no paid tier on this tool. The entire conversion runs in your browser, so the only cost to anyone is your CPU. We don't show ads on this page.",
  },
  {
    question: "Does my video get uploaded anywhere?",
    answer:
      "No. The conversion happens locally inside your browser tab using ffmpeg.wasm — a WebAssembly build of the same ffmpeg used by professional video tooling. Your file is never uploaded, never copied to our servers, and never logged. You can verify by opening DevTools → Network and watching the conversion: there are no requests for your file.",
  },
  {
    question: "What video formats can I convert?",
    answer:
      "MP4, MOV (QuickTime), WebM, and MKV (Matroska) — the four most common video container formats. The tool magic-byte sniffs each file before starting, so renaming a non-video file to .mp4 is caught early instead of crashing the encoder.",
  },
  {
    question: "Why convert an MP4 to a GIF when GIFs are bigger?",
    answer:
      "GIFs auto-play with no controls, render natively in places that don't load video (GitHub READMEs, RSS readers, some email clients, older forums, embed-restricted comment threads), and feel like part of the message rather than a player widget. They're the right tool for short reaction clips, demo loops in documentation, and chats where the visual punch of an inline-playing animation matters more than file size.",
  },
  {
    question: "What's the maximum file size?",
    answer:
      "There's no hard cap, but in practice browsers struggle past ~100 MB because the entire file has to fit in WebAssembly memory. For best results, keep clips under 20 seconds — GIFs grow quickly with duration, and short clips look more like animations than slow-motion sequences.",
  },
  {
    question: "What resolution and framerate does the GIF use?",
    answer:
      "The output is 480px wide (preserving aspect ratio) at 12 fps. That's the sweet spot for size and smoothness — wider GIFs balloon in size without much perceived quality gain because the format caps at a 256-color palette regardless of resolution.",
  },
  {
    question: "Does the converter use a single-pass or two-pass palette?",
    answer:
      "Two-pass. ffmpeg.wasm runs palettegen first to compute the optimal 256-color palette for your specific clip, then paletteuse with Bayer dithering to apply it. The result is dramatically cleaner than single-pass converters that use a fixed web-safe palette — colors look like the source instead of a 1995 desktop screenshot.",
  },
  {
    question: "Why does the first conversion take longer than the rest?",
    answer:
      "The first time you convert anything in this tab, the browser downloads about 25 MB of WebAssembly (the ffmpeg core). After that it's cached, and every subsequent conversion in the same session starts instantly. If you reload the page or open a private window, the download repeats.",
  },
  {
    question: "I want to do the reverse — GIF to MP4. Where?",
    answer:
      "We have a dedicated tool for that at vidsandgifs.com/tools/gif-to-mp4. Drop your GIF there and get a 480p MP4 typically 5–20× smaller than the source.",
  },
];

const HOW_TO_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to convert an MP4 to a GIF in your browser",
  description:
    "Convert any video (MP4, MOV, WebM, MKV) to an animated GIF entirely in your web browser using ffmpeg.wasm. No upload, no signup, no software install.",
  totalTime: "PT45S",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Drop or pick your video",
      text: "Open vidsandgifs.com/tools/mp4-to-gif and drag a video file onto the dropzone, or click to pick one from your computer. The tool reads the file locally — nothing is uploaded.",
      url: `${PAGE_URL}#step-1`,
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Wait for the encode",
      text: "ffmpeg.wasm runs a two-pass palette-optimized GIF encode in your browser tab. The first conversion downloads about 25 MB of WebAssembly; later conversions in the same session are instant.",
      url: `${PAGE_URL}#step-2`,
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Download the GIF",
      text: "Click 'Download GIF' to save the converted file. The output is 480px wide at 12 fps with a custom 256-color palette — playable on every browser, chat app, and README.",
      url: `${PAGE_URL}#step-3`,
    },
  ],
};

const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "vids&gifs MP4 to GIF converter",
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
    "Convert MP4 / MOV / WebM / MKV to animated GIF entirely in the browser",
    "Two-pass palette-optimized encode for native-ffmpeg quality",
    "No file upload — privacy-preserving local conversion",
    "No signup, no watermark, no daily limit",
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
      item: absoluteUrl("/tools/mp4-to-gif"),
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "MP4 to GIF converter",
      item: PAGE_URL,
    },
  ],
};

export default function Mp4ToGifPage() {
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
        <Mp4ToGifTool />
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 1, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          Why turn a video into a GIF?
        </Heading>
        <Text as="p" color="gray" size="3" mb="5" style={{ maxWidth: 700 }}>
          GIFs are bigger than equivalent MP4s, but they auto-play with no
          controls, render where videos can't, and read as part of the
          message. For short reactions, demo loops, and embed-hostile
          surfaces, they're still the right tool.
        </Text>

        <Grid columns={{ initial: "1", sm: "3" }} gap="4">
          <BenefitCard
            Icon={LightningBoltIcon}
            title="Auto-play, everywhere"
            body="No play button, no codec negotiation, no autoplay policy fighting the browser. Drop a GIF in any chat, README, or email and it starts looping the moment it loads."
          />
          <BenefitCard
            Icon={StackIcon}
            title="Native palette tuning"
            body="A two-pass palettegen / paletteuse encode picks the best 256 colors for your specific clip — far cleaner than single-pass converters that use a fixed web-safe palette."
          />
          <BenefitCard
            Icon={LockClosedIcon}
            title="Privacy by default"
            body="The conversion runs in this browser tab using ffmpeg.wasm. Your video is never uploaded, never queued, never logged. Close the tab and nothing remains."
          />
        </Grid>
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 2, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          Where GIFs still win
        </Heading>
        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          <UseCaseCard
            Icon={CodeIcon}
            title="GitHub READMEs"
            body="GitHub renders GIFs inline in markdown. Videos render as a download link. If you want your README to demo the feature instead of asking a reader to download a clip, GIFs are still the answer."
          />
          <UseCaseCard
            Icon={EnvelopeClosedIcon}
            title="Email signatures and newsletters"
            body="Most email clients block HTML5 video and strip half of any modern markup. An animated GIF is the lowest-common-denominator inline animation that still actually plays in Outlook, Gmail, and Apple Mail."
          />
          <UseCaseCard
            Icon={ChatBubbleIcon}
            title="Comment threads"
            body="Reddit, Hacker News, Lobste.rs, and most forum software allow image embeds but not video. GIFs render where MP4 links sit unwatched at the bottom of a thread."
          />
          <UseCaseCard
            Icon={PaperPlaneIcon}
            title="Quick reaction clips"
            body="A 2-second reaction GIF carries the punch of an inline animation without dragging in a video player UI. For under-3-second clips, the file-size argument for MP4 mostly evaporates anyway."
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
            href="/tools/gif-to-mp4"
            style={{
              color: "var(--gray-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            GIF → MP4 converter
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
