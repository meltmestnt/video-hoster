import Link from "next/link";
import { Box, Button, Flex } from "@radix-ui/themes";
import { T } from "@/lib/i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { InstantGifDemo } from "./InstantGifDemo";
import { AnonChatLibraryHero } from "./AnonChatLibraryHero";

/**
 * Anonymous landing — leads with the actual differentiator.
 *
 *   1. **Cross-chat private library** (AnonChatLibraryHero): your private
 *      folders of GIFs and videos, sendable inline from Telegram and
 *      Discord with one shared library. The thing Tenor structurally
 *      can't do — and what makes vidsandgifs hard to copy.
 *   2. **In-browser conversion** (InstantGifDemo): demoted to a
 *      secondary capability. Useful and a strong interactive hook for
 *      cold visitors, but commodity vs the cross-chat pitch.
 *
 * Earlier versions led with the converter and split the cross-chat story
 * across two thin panels (folders + bots). The headline differentiator
 * landed below the fold, and the bot panel had a half-empty right side.
 * This version unifies the differentiator into one panel anchored by
 * real screenshots of the inline picker (Telegram) and /gif autocomplete
 * (Discord) so the pitch is visible at first glance.
 */
export function AnonymousIntro() {
  return (
    <>
      <Box
        className="intro-panel-fade-up"
        style={{
          position: "relative",
          minHeight: 0,
          ["--panel-index" as string]: 0,
        }}
      >
        {/* The locale switcher is the only top-right control on the
            anonymous landing — pinned in absolute coordinates so it sits
            above the hero's gradient backdrop. */}
        <Box
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 4,
          }}
        >
          <LocaleSwitcher size="1" />
        </Box>
        <AnonChatLibraryHero />
      </Box>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 1 }}
      >
        <InstantGifDemo signedIn={false} />
      </div>

      <Flex
        className="intro-cta-row intro-panel-fade-up"
        gap="3"
        mb="6"
        wrap="wrap"
        align="center"
        style={{ ["--panel-index" as string]: 2 }}
      >
        {/* `plausible-event-name=...` activates Plausible's tagged-events
            handler — clicking the link fires the named custom event with
            no JS handler. Names are deliberately generic so they group
            cleanly in the dashboard. */}
        <Button
          asChild
          size="3"
          variant="solid"
          className="plausible-event-name=Landing+Signup"
        >
          <Link href="/signup">
            <T k="intro.cta.signUp" />
          </Link>
        </Button>
        <Button
          asChild
          size="3"
          variant="soft"
          color="gray"
          className="plausible-event-name=Landing+Signin"
        >
          <Link href="/login">
            <T k="intro.cta.signIn" />
          </Link>
        </Button>
        <Button
          asChild
          size="3"
          variant="ghost"
          color="iris"
          className="plausible-event-name=Landing+Browse"
        >
          <Link href="/all">
            <T k="intro.cta.browse" />
          </Link>
        </Button>
      </Flex>
    </>
  );
}
