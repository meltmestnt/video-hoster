import Link from "next/link";
import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import {
  CameraIcon,
  ChatBubbleIcon,
  ImageIcon,
  MagicWandIcon,
  SpeakerLoudIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import { T } from "@/lib/i18n";

type Icon = typeof VideoIcon;

interface Feature {
  Icon: Icon;
  titleKey:
    | "intro.f.video.title"
    | "intro.f.gif.title"
    | "intro.f.screenshot.title"
    | "intro.f.audio.title"
    | "intro.f.convert.title"
    | "intro.f.community.title";
  descKey:
    | "intro.f.video.desc"
    | "intro.f.gif.desc"
    | "intro.f.screenshot.desc"
    | "intro.f.audio.desc"
    | "intro.f.convert.desc"
    | "intro.f.community.desc";
}

const FEATURES: Feature[] = [
  {
    Icon: VideoIcon,
    titleKey: "intro.f.video.title",
    descKey: "intro.f.video.desc",
  },
  {
    Icon: ImageIcon,
    titleKey: "intro.f.gif.title",
    descKey: "intro.f.gif.desc",
  },
  {
    Icon: MagicWandIcon,
    titleKey: "intro.f.convert.title",
    descKey: "intro.f.convert.desc",
  },
  {
    Icon: CameraIcon,
    titleKey: "intro.f.screenshot.title",
    descKey: "intro.f.screenshot.desc",
  },
  {
    Icon: SpeakerLoudIcon,
    titleKey: "intro.f.audio.title",
    descKey: "intro.f.audio.desc",
  },
  {
    Icon: ChatBubbleIcon,
    titleKey: "intro.f.community.title",
    descKey: "intro.f.community.desc",
  },
];

export function AnonymousIntro() {
  return (
    <Box
      className="intro-card"
      mb="6"
      style={{
        position: "relative",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, var(--accent-3) 0%, var(--gray-2) 65%)",
        borderRadius: "var(--radius-4)",
        padding: "40px 32px",
      }}
    >
      {/* Soft accent glow in the upper-right corner — purely decorative,
          uses the same iris palette as the brand glyph and OG image. */}
      <Box
        aria-hidden
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 360,
          height: 360,
          background:
            "radial-gradient(circle, var(--accent-9) 0%, transparent 70%)",
          opacity: 0.18,
          pointerEvents: "none",
        }}
      />
      <Box
        aria-hidden
        style={{
          position: "absolute",
          bottom: -160,
          left: -100,
          width: 320,
          height: 320,
          background:
            "radial-gradient(circle, var(--accent-9) 0%, transparent 70%)",
          opacity: 0.08,
          pointerEvents: "none",
        }}
      />

      <Box
        className="intro-heading-block"
        style={{ position: "relative", zIndex: 2, maxWidth: 720 }}
      >
        <Heading
          size="8"
          mb="3"
          style={{ letterSpacing: "-0.025em", lineHeight: 1.1 }}
        >
          <T k="intro.heading" />
        </Heading>
        <Text as="p" size="3" color="gray" mb="6">
          <T k="intro.subtitle" />
        </Text>
      </Box>

      <div className="intro-features">
        {FEATURES.map(({ Icon, titleKey, descKey }) => (
          <Flex
            key={titleKey}
            align="start"
            gap="3"
            style={{ position: "relative" }}
          >
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
                flexShrink: 0,
                boxShadow: "inset 0 0 0 1px var(--accent-6)",
              }}
            >
              <Icon width="20" height="20" />
            </Box>
            <Box style={{ minWidth: 0 }}>
              <Text as="div" size="3" weight="medium" mb="1">
                <T k={titleKey} />
              </Text>
              <Text
                as="div"
                size="2"
                color="gray"
                style={{ lineHeight: 1.45 }}
              >
                <T k={descKey} />
              </Text>
            </Box>
          </Flex>
        ))}
      </div>

      <Flex
        className="intro-cta-row"
        gap="3"
        mt="6"
        wrap="wrap"
        align="center"
        style={{ position: "relative", zIndex: 2 }}
      >
        <Button asChild size="3" variant="solid">
          <Link href="/signup">
            <T k="intro.cta.signUp" />
          </Link>
        </Button>
        <Button asChild size="3" variant="soft" color="gray">
          <Link href="/login">
            <T k="intro.cta.signIn" />
          </Link>
        </Button>
        <Button asChild size="3" variant="ghost" color="iris">
          <Link href="/videos">
            <T k="intro.cta.browse" />
          </Link>
        </Button>
      </Flex>
    </Box>
  );
}
