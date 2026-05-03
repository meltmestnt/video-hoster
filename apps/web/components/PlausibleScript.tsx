import Script from "next/script";

interface Props {
  domain: string;
}

/**
 * Plausible Analytics loader. Cookieless, no fingerprinting, no
 * personal-data collection — which is why we don't need a consent
 * banner around it. Loads the `outbound-links.tagged-events`
 * extension bundle so:
 *
 *   • outbound link clicks track automatically (free signal — see
 *     who's clicking through to GitHub, Discord install URLs, etc.)
 *   • elements with class `plausible-event-name=Foo` fire custom
 *     events on click without needing a JS handler
 *
 * For events fired from JS code (form submits, demo state changes,
 * etc.) use `trackEvent` from `lib/analytics`.
 */
export function PlausibleScript({ domain }: Props) {
  return (
    <Script
      defer
      strategy="afterInteractive"
      data-domain={domain}
      src="https://plausible.io/js/script.outbound-links.tagged-events.js"
    />
  );
}
