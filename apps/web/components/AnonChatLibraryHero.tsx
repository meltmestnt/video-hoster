import Image from "next/image";
import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Text,
} from "@radix-ui/themes";
import {
  ArchiveIcon,
  ChatBubbleIcon,
  MagnifyingGlassIcon,
  PaperPlaneIcon,
  Share1Icon,
} from "@radix-ui/react-icons";
import { T } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";

type FeatureIcon = typeof ArchiveIcon;

interface HeroFeature {
  Icon: FeatureIcon;
  titleKey: TKey;
  descKey: TKey;
}

const FEATURES: HeroFeature[] = [
  {
    Icon: ArchiveIcon,
    titleKey: "anonChatLib.feature.private.title",
    descKey: "anonChatLib.feature.private.desc",
  },
  {
    Icon: MagnifyingGlassIcon,
    titleKey: "anonChatLib.feature.scoped.title",
    descKey: "anonChatLib.feature.scoped.desc",
  },
  {
    Icon: PaperPlaneIcon,
    titleKey: "anonChatLib.feature.autoFile.title",
    descKey: "anonChatLib.feature.autoFile.desc",
  },
  {
    Icon: Share1Icon,
    titleKey: "anonChatLib.feature.share.title",
    descKey: "anonChatLib.feature.share.desc",
  },
];

/**
 * The landing page's lead panel: pitches the cross-chat shared library —
 * the actual differentiator vs Tenor / built-in OS GIF pickers. Combines
 * what used to be two separate cards (private folders + Telegram/Discord
 * bots) into one hero, anchored by real screenshots of the inline picker
 * in Telegram and the /gif autocomplete in Discord. The screenshots are
 * stacked at slight angles so the "two surfaces, one library" story is
 * visible at a glance.
 *
 * The conversion demo (InstantGifDemo) follows below as a secondary
 * capability — useful, but not what makes the product hard to copy.
 */
export function AnonChatLibraryHero() {
  return (
    <Box
      className="anon-chatlib-hero intro-card intro-card-blueiris"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--radius-5)",
        border: "1px solid var(--gray-5)",
        marginBottom: 32,
      }}
    >
      <Box className="anon-chatlib-bg" aria-hidden />
      <Box className="anon-chatlib-grid" aria-hidden />

      <div className="anon-chatlib-layout">
        <Flex
          direction="column"
          gap="3"
          align="start"
          className="anon-chatlib-copy"
        >
          <Badge
            color="blue"
            variant="surface"
            radius="full"
            className="anon-chatlib-badge"
            style={{ paddingInline: 12 }}
          >
            <PaperPlaneIcon width="12" height="12" />
            <ChatBubbleIcon width="12" height="12" />
            <Text size="1" weight="medium" ml="1">
              <T k="anonChatLib.badge" />
            </Text>
          </Badge>

          <Heading
            size="8"
            className="anon-chatlib-headline"
            style={{
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              maxWidth: 620,
            }}
          >
            <T k="anonChatLib.headline.before" />{" "}
            <Text as="span" className="anon-chatlib-grad">
              <T k="anonChatLib.headline.highlight" />
            </Text>
          </Heading>

          <Text
            as="p"
            size="3"
            color="gray"
            style={{ maxWidth: 560, lineHeight: 1.55 }}
          >
            <T k="anonChatLib.subtitle" />
          </Text>

          <Flex gap="3" mt="3" align="center" wrap="wrap">
            <Button
              asChild
              size="3"
              variant="solid"
              color="blue"
              className="plausible-event-name=Anon+ChatLib+Signup"
            >
              <Link href="/signup">
                <T k="anonChatLib.cta.signUp" />
              </Link>
            </Button>
            <Text as="div" size="2" color="gray">
              <T k="anonChatLib.cta.signInPrompt" />{" "}
              <Link
                href="/login"
                style={{ color: "var(--blue-11)", textDecoration: "none" }}
              >
                <T k="anonChatLib.cta.signIn" />
              </Link>
            </Text>
          </Flex>

          <div className="anon-chatlib-features">
            {FEATURES.map(({ Icon, titleKey, descKey }, i) => (
              <div
                key={titleKey}
                className="anon-chatlib-feature"
                style={{ ["--feat-index" as string]: i }}
              >
                <div className="anon-chatlib-feat-icon">
                  <Icon width="16" height="16" />
                </div>
                <Text as="div" size="2" weight="medium" mt="2">
                  <T k={titleKey} />
                </Text>
                <Text
                  as="div"
                  size="2"
                  color="gray"
                  style={{ lineHeight: 1.45 }}
                  mt="1"
                >
                  <T k={descKey} />
                </Text>
              </div>
            ))}
          </div>
        </Flex>

        {/* The screenshots float on the right at slight angles —
            Telegram anchored top-right and Discord offset below-left so
            they overlap but each label is readable. Hovering a shot
            scales it up and adds a soft glow; the inner .shot-bob
            wrapper carries an ambient float keyframe so the cards drift
            up and down independently. Native click-and-drag is
            suppressed on the images themselves so the hover gesture
            stays clean. */}
        <div className="anon-chatlib-shots">
          <div className="anon-chatlib-shot anon-chatlib-shot--telegram">
            <span className="anon-chatlib-shot-bob">
              <span className="anon-chatlib-shot-label">
                <PaperPlaneIcon width="11" height="11" /> Telegram
              </span>
              <Image
                src="/landing/telegram-inline-picker.png"
                alt="@vidsandgifsbot inline picker in a Telegram chat"
                width={685}
                height={917}
                priority
                sizes="(max-width: 900px) 60vw, 320px"
                draggable={false}
              />
            </span>
          </div>
          <div className="anon-chatlib-shot anon-chatlib-shot--discord">
            <span className="anon-chatlib-shot-bob">
              <span className="anon-chatlib-shot-label">
                <ChatBubbleIcon width="11" height="11" /> Discord
              </span>
              <Image
                src="/landing/discord-gif-autocomplete.png"
                alt="/gif command with autocomplete in a Discord channel"
                width={1172}
                height={1112}
                sizes="(max-width: 900px) 60vw, 360px"
                draggable={false}
              />
            </span>
          </div>
        </div>
      </div>
    </Box>
  );
}
