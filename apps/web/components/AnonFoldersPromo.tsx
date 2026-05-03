import { Badge, Box, Flex, Heading, Text } from "@radix-ui/themes";
import {
  ArchiveIcon,
  MagnifyingGlassIcon,
  PaperPlaneIcon,
  Share1Icon,
} from "@radix-ui/react-icons";
import { T } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";

type FeatureIcon = typeof ArchiveIcon;

interface PromoFeature {
  Icon: FeatureIcon;
  titleKey: TKey;
  descKey: TKey;
}

const FEATURES: PromoFeature[] = [
  {
    Icon: ArchiveIcon,
    titleKey: "anonFolders.feature.private.title",
    descKey: "anonFolders.feature.private.desc",
  },
  {
    Icon: MagnifyingGlassIcon,
    titleKey: "anonFolders.feature.scopedSearch.title",
    descKey: "anonFolders.feature.scopedSearch.desc",
  },
  {
    Icon: PaperPlaneIcon,
    titleKey: "anonFolders.feature.autoTag.title",
    descKey: "anonFolders.feature.autoTag.desc",
  },
  {
    Icon: Share1Icon,
    titleKey: "anonFolders.feature.share.title",
    descKey: "anonFolders.feature.share.desc",
  },
];

/**
 * Anonymous-landing pitch for private folders — the "organize" panel
 * of the convert → organize → distribute funnel. Sits between the
 * InstantGifDemo hero (the import step) and the AnonTelegramPromo
 * chat-bots card (the distribution step). Uses iris (site accent)
 * instead of the chat-bots card's blue so the visual rhythm tells the
 * user this is a different step, while the gradient mirror + grid
 * backdrop keep them family.
 */
export function AnonFoldersPromo() {
  return (
    <Box
      className="intro-card intro-card-iris"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--radius-5)",
        background:
          "radial-gradient(circle at 0% 0%, rgba(125, 102, 255, 0.28) 0%, transparent 55%), " +
          "radial-gradient(circle at 100% 100%, rgba(125, 102, 255, 0.16) 0%, transparent 50%), " +
          "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
        border: "1px solid var(--gray-5)",
        padding: "32px",
        marginBottom: 32,
      }}
    >
      {/* Subtle grid backdrop, masked to fade out toward the card edges
          so it adds texture without competing with the headline. */}
      <Box
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), " +
            "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <Flex
        direction="column"
        gap="3"
        align="start"
        style={{ position: "relative", zIndex: 2 }}
      >
        <Badge
          color="iris"
          variant="surface"
          radius="full"
          style={{ paddingInline: 12 }}
        >
          <ArchiveIcon width="12" height="12" />
          <Text size="1" weight="medium" ml="1">
            <T k="anonFolders.badge" />
          </Text>
        </Badge>
        <Heading
          size="7"
          style={{ letterSpacing: "-0.02em", lineHeight: 1.1, maxWidth: 760 }}
        >
          <T k="anonFolders.headline.before" />{" "}
          <Text
            as="span"
            style={{
              backgroundImage:
                "linear-gradient(120deg, var(--iris-9) 0%, #c5b6ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            <T k="anonFolders.headline.highlight" />
          </Text>
        </Heading>
        <Text
          as="p"
          size="3"
          color="gray"
          style={{ maxWidth: 680, lineHeight: 1.5 }}
        >
          <T k="anonFolders.subtitle" />
        </Text>

        {/* Feature grid — auto-fits 2-4 columns based on width and
            collapses to one column on narrow screens so the icon +
            copy stay legible on mobile. */}
        <Box
          mt="4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            width: "100%",
          }}
        >
          {FEATURES.map(({ Icon, titleKey, descKey }) => (
            <Flex
              key={titleKey}
              direction="column"
              gap="2"
              align="start"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
                border: "1px solid var(--gray-5)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <Box
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--iris-4)",
                  color: "var(--iris-11)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "inset 0 0 0 1px var(--iris-6)",
                }}
              >
                <Icon width="18" height="18" />
              </Box>
              <Text as="div" size="3" weight="medium">
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
            </Flex>
          ))}
        </Box>
      </Flex>
    </Box>
  );
}
