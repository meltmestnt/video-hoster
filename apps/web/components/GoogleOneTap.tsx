"use client";

import { useEffect, useRef, useState } from "react";
import { Box } from "@radix-ui/themes";
import { signIn, useSession } from "next-auth/react";
import Script from "next/script";

interface Props {
  /**
   * Google OAuth client ID. We pass this from the server layout so we don't
   * need a separate NEXT_PUBLIC_ env — the value isn't actually secret
   * (it's exposed in every Google OAuth redirect anyway), but threading it
   * through the layout keeps env config in one place.
   */
  clientId: string;
}

interface CredentialResponse {
  credential: string;
}

interface PromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
  getDismissedReason: () => string;
  getMomentType: () => string;
}

interface RenderButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(opts: {
            client_id: string;
            callback: (response: CredentialResponse) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
            context?: "signin" | "signup" | "use";
            itp_support?: boolean;
          }): void;
          prompt(listener?: (notification: PromptNotification) => void): void;
          renderButton(parent: HTMLElement, opts: RenderButtonOptions): void;
          cancel(): void;
        };
      };
    };
  }
}

const isDev = process.env.NODE_ENV !== "production";

const log = (...args: unknown[]) => {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.info("[GoogleOneTap]", ...args);
};

/**
 * Top-right Google sign-in surface. Two things on the page at once:
 *   1. The One Tap prompt (auto-popup) — usually appears, but Chrome
 *      suppresses it for hours after any dismissal, FedCM has its own
 *      cooldown, and the prompt-notification callback is silently dropped
 *      whenever FedCM is the active path. So you can't rely on it alone.
 *   2. A visible "Continue with Google" button rendered by GSI itself —
 *      this never hits any cooldown and is what the user clicks when the
 *      auto-prompt didn't show.
 *
 * Both feed the same NextAuth `google-one-tap` credentials provider.
 *
 * Skipped when:
 *  - the user is already signed in,
 *  - GOOGLE_CLIENT_ID isn't configured (we can't talk to Google).
 */
export function GoogleOneTap({ clientId }: Props) {
  const { status } = useSession();
  const initialized = useRef(false);
  const buttonHostRef = useRef<HTMLDivElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!clientId) {
      log(
        "GOOGLE_CLIENT_ID is empty — pass it via env. " +
          "The component will not render anything until it's set.",
      );
    }
  }, [clientId]);

  const init = () => {
    if (!clientId) return;
    if (typeof window === "undefined") return;
    if (!window.google?.accounts?.id) {
      log("script not ready yet, waiting…");
      return;
    }
    if (initialized.current) {
      log("already initialized, skipping");
      return;
    }
    initialized.current = true;

    log("initializing GSI with client_id", clientId.slice(0, 12) + "…");
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        log("credential received, signing in…");
        if (!response?.credential) return;
        // redirect:false keeps the user on the current page after sign-in;
        // NextAuth's session listener will pick up the new session and
        // refresh state via SessionProvider.
        const result = await signIn("google-one-tap", {
          credential: response.credential,
          redirect: false,
        });
        log("signIn result", result);
      },
      // FedCM is the modern third-party-cookie-free path. Chrome 119+ has
      // it on by default; setting this to true makes our flow forward-
      // compatible with Chrome's removal of the legacy 3p-cookie path.
      use_fedcm_for_prompt: true,
      cancel_on_tap_outside: false,
      auto_select: false,
      itp_support: true,
      context: "signin",
    });

    // Render the visible button into our portal div. This runs even if
    // One Tap's prompt is suppressed by cooldown — the button is the
    // always-available path.
    if (buttonHostRef.current) {
      // Clear any prior render so re-init doesn't stack two buttons.
      buttonHostRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonHostRef.current, {
        type: "standard",
        theme: "filled_blue",
        size: "medium",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "left",
      });
    }

    // The diagnostic listener is dropped under FedCM, but we still pass
    // it for the legacy path (older Chrome, Firefox One Tap, etc.) where
    // it actually fires. Worth nothing in modern Chrome — useful in
    // anything older.
    window.google.accounts.id.prompt((n) => {
      if (n.isNotDisplayed()) log("not displayed:", n.getNotDisplayedReason());
      else if (n.isSkippedMoment()) log("skipped:", n.getSkippedReason());
      else if (n.isDismissedMoment())
        log("dismissed:", n.getDismissedReason());
    });
  };

  useEffect(() => {
    if (status !== "unauthenticated") return;
    if (!scriptReady) return;
    init();
    // initialized.current keeps re-renders from re-prompting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, status, scriptReady]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      window.google?.accounts?.id?.cancel?.();
    };
  }, []);

  if (!clientId) return null;
  if (status !== "unauthenticated") return null;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => {
          log("gsi/client script loaded");
          setScriptReady(true);
        }}
      />
      <Box
        // Sits below the (sticky) TopBar (z-index 10) but above the page
        // content. Top-right corner mirrors where One Tap lands so the
        // visual treatment of "log in here" stays consistent whether the
        // auto-popup works or not.
        style={{
          position: "fixed",
          top: 72,
          right: 16,
          zIndex: 9,
        }}
      >
        <div ref={buttonHostRef} />
      </Box>
    </>
  );
}
