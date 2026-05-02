import Link from "next/link";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import {
  CameraIcon,
  ChatBubbleIcon,
  ImageIcon,
  MagicWandIcon,
  SpeakerLoudIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import { T } from "@/lib/i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { InstantGifDemo } from "./InstantGifDemo";
import { AnonTelegramPromo } from "./AnonTelegramPromo";

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
    <>
      {/* The locale switcher is the only top-right control on the
          anonymous landing — pinned in absolute coordinates so it sits
          above the demo's gradient backdrop. The choice persists via
          localStorage inside the i18n provider. */}
      <Box
        style={{
          position: "relative",
          minHeight: 0,
        }}
      >
        <Box
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 4,
          }}
        >
          <LocaleSwitcher size="1" />
        </Box>
        {/* Hero showpiece — drop a video, get a GIF, all in-browser. The
            killer demo that doubles as the home page's value prop. */}
        <InstantGifDemo signedIn={false} />
      </Box>

      <AnonTelegramPromo />

      <Flex
        className="intro-cta-row"
        gap="3"
        mb="6"
        wrap="wrap"
        align="center"
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
          <Link href="/all">
            <T k="intro.cta.browse" />
          </Link>
        </Button>
      </Flex>

      {/* Compact feature grid below the hero — keeps the rest of the
          marketing pitch on the page without competing with the demo
          for attention. */}
      <div className="intro-features">
        {FEATURES.map(({ Icon, titleKey, descKey }) => (
          <Flex key={titleKey} align="start" gap="3">
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
    </>
  );
}
