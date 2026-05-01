import Link from "next/link";
import { Box, Button, Callout, Flex, Heading, Text } from "@radix-ui/themes";
import { ANON_DAILY_VIEW_LIMIT } from "@repo/shared";
import { T } from "@/lib/i18n";

interface Props {
  kind: "video" | "gif";
  callbackPath: string;
}

/**
 * Shown in place of the player when an anonymous viewer has hit the daily
 * distinct-target watch cap. The cap is per-IP per rolling 24h — the API
 * throws ANON_VIEW_LIMIT:{kind} from byId once it fires, and the SSR page
 * swaps in this component instead of notFound() so the visitor gets a
 * clear next step (sign in / sign up).
 */
export function AnonViewLimitNotice({ kind, callbackPath }: Props) {
  const titleKey =
    kind === "video"
      ? "anonViewLimit.title.video"
      : "anonViewLimit.title.gif";
  const bodyKey =
    kind === "video"
      ? "anonViewLimit.body.video"
      : "anonViewLimit.body.gif";

  return (
    <Box style={{ maxWidth: 560, margin: "64px auto", padding: "0 16px" }}>
      <Callout.Root color="iris" mb="4">
        <Callout.Text>
          <T k="anonViewLimit.callout" vars={{ limit: ANON_DAILY_VIEW_LIMIT }} />
        </Callout.Text>
      </Callout.Root>
      <Heading size="5" mb="2">
        <T k={titleKey} />
      </Heading>
      <Text as="p" color="gray" size="2" mb="4">
        <T k={bodyKey} vars={{ limit: ANON_DAILY_VIEW_LIMIT }} />
      </Text>
      <Flex gap="3">
        <Button asChild size="2" variant="solid" color="iris">
          <Link href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}>
            <T k="anonViewLimit.signIn" />
          </Link>
        </Button>
        <Button asChild size="2" variant="soft" color="gray">
          <Link href={`/signup?callbackUrl=${encodeURIComponent(callbackPath)}`}>
            <T k="anonViewLimit.signUp" />
          </Link>
        </Button>
      </Flex>
    </Box>
  );
}
