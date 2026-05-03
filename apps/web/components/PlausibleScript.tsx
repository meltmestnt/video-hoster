import Script from "next/script";

interface Props {
  /**
   * Full URL of the Plausible tracker script — e.g.
   * https://plausible.io/js/pa-XXXXXXXXXXXX.js
   *
   * Plausible v2 bakes the site identifier into the script URL
   * itself (the legacy `data-domain="example.com"` approach is gone)
   * and ships outbound-link + tagged-events handlers in the same
   * bundle, so there's no separate script-variant to choose.
   * Get the URL from your Plausible dashboard → Site settings →
   * Installation tab.
   */
  scriptUrl: string;
}

/**
 * Plausible Analytics loader. Two-script pattern straight from
 * Plausible's installation snippet:
 *
 *   1. Async-loaded tracker bundle from plausible.io.
 *   2. Inline init script that defines the queue stub
 *      (`plausible.q.push(arguments)`) so events fired before the
 *      tracker has loaded aren't lost, then calls `plausible.init()`
 *      to kick off pageview tracking.
 *
 * Cookieless, no fingerprinting, no personal-data collection — which
 * is why we don't gate this behind a consent banner. For events
 * fired from JS code use `trackEvent` from `lib/analytics`.
 */
export function PlausibleScript({ scriptUrl }: Props) {
  return (
    <>
      <Script async strategy="afterInteractive" src={scriptUrl} />
      <Script id="plausible-init" strategy="afterInteractive">
        {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
      </Script>
    </>
  );
}
