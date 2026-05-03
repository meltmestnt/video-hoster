import Link from "next/link";
import { Box, Button, Flex } from "@radix-ui/themes";
import { T } from "@/lib/i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { InstantGifDemo } from "./InstantGifDemo";
import { AnonTelegramPromo } from "./AnonTelegramPromo";
import { AnonFoldersPromo } from "./AnonFoldersPromo";

/**
 * Anonymous landing structured as a three-step funnel that mirrors the
 * product's actual flow:
 *
 *   1. **In** — InstantGifDemo: drop a video, get a GIF in the browser.
 *      Conversion is the entry point that puts something into the
 *      library. Doubles as the killer demo (no-signup-required value).
 *   2. **Organize** — AnonFoldersPromo: private folders, the "you own
 *      your library" half of the differentiator vs Tenor.
 *   3. **Distribute** — AnonTelegramPromo: send from any chat via the
 *      Telegram + Discord bots. Same library across surfaces — the
 *      thing Tenor structurally can't do.
 *
 * Earlier versions of this page led with a 7-feature grid (videos,
 * GIFs, URL upload, in-browser convert, screenshots, audio, community)
 * that diluted the pitch — every capability fought for the same eyeline
 * and the cross-platform-library story got buried. The funnel framing
 * makes the differentiator the headline; secondary capabilities can
 * be re-added later as a slim "and more" row if SEO needs it.
 */
export function AnonymousIntro() {
  return (
    <>
      {/* The locale switcher is the only top-right control on the
          anonymous landing — pinned in absolute coordinates so it sits
          above the demo's gradient backdrop. The choice persists via
          localStorage inside the i18n provider.
          --panel-index drives the staggered slide-up (see
          .intro-panel-fade-up in globals.css) — three funnel panels in
          sequence, 160ms apart. */}
      <Box
        className="intro-panel-fade-up"
        style={{
          position: "relative",
          minHeight: 0,
          ["--panel-index" as string]: 0,
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
        {/* 1. In — drop a video, get a GIF, all in-browser. */}
        <InstantGifDemo signedIn={false} />
      </Box>

      {/* 2. Organize — private folders. */}
      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 1 }}
      >
        <AnonFoldersPromo />
      </div>

      {/* 3. Distribute — Telegram + Discord, same library. */}
      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 2 }}
      >
        <AnonTelegramPromo />
      </div>

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
    </>
  );
}
