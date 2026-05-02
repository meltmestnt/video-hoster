import Link from "next/link";
import { Badge, Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { T } from "@/lib/i18n";

/**
 * Anonymous-landing pitch for the Telegram bot integration. Mirrors the
 * layered visual of the InstantGifDemo hero (dark base + corner glows +
 * grid overlay) so the two cards read as a pair, but uses the blue
 * variant of the running-border treatment to differentiate the feature.
 */
export function AnonTelegramPromo() {
  return (
    <Box
      className="intro-card intro-card-blue"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--radius-5)",
        background:
          "radial-gradient(circle at 100% 0%, rgba(70, 132, 255, 0.32) 0%, transparent 55%), " +
          "radial-gradient(circle at 0% 100%, rgba(70, 132, 255, 0.18) 0%, transparent 50%), " +
          "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
        border: "1px solid var(--gray-5)",
        padding: "32px",
        marginBottom: 32,
      }}
    >
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
          color="blue"
          variant="surface"
          radius="full"
          style={{ paddingInline: 12 }}
        >
          <PaperPlaneIcon width="12" height="12" />
          <Text size="1" weight="medium" ml="1">
            <T k="anonTelegram.badge" />
          </Text>
        </Badge>
        <Heading
          size="7"
          style={{ letterSpacing: "-0.02em", lineHeight: 1.1, maxWidth: 760 }}
        >
          <T k="anonTelegram.headline.before" />{" "}
          <Text
            as="span"
            style={{
              backgroundImage:
                "linear-gradient(120deg, var(--blue-9) 0%, #93c5ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            <T k="anonTelegram.headline.highlight" />
          </Text>
        </Heading>
        <Text
          as="p"
          size="3"
          color="gray"
          style={{ maxWidth: 640, lineHeight: 1.5 }}
        >
          <T k="anonTelegram.subtitle" />
        </Text>
        <Flex gap="3" mt="2" wrap="wrap">
          <Button asChild size="3" variant="solid" color="blue">
            <Link href="/signup">
              <T k="anonTelegram.cta.signUp" />
            </Link>
          </Button>
          <Button asChild size="3" variant="ghost" color="gray">
            <Link href="/login">
              <T k="anonTelegram.cta.signIn" />
            </Link>
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
