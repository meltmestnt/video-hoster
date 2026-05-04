/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@radix-ui/themes", "@radix-ui/react-icons"],
  },
  transpilePackages: ["@repo/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.s3.amazonaws.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
    ],
  },
  async rewrites() {
    // /@:username is a friendlier public-profile URL than /u/:username,
    // but Next.js doesn't allow `@` in folder names (it collides with
    // the parallel-routes syntax). Rewrite at the edge so the file-system
    // route lives at /u/[username] while users see /@handle in the bar.
    const profileRewrite = {
      source: "/@:username",
      destination: "/u/:username",
    };
    if (process.env.NODE_ENV !== "development") return [profileRewrite];
    return [
      { source: "/trpc/:path*", destination: "http://localhost:4000/trpc/:path*" },
      profileRewrite,
    ];
  },
  async headers() {
    return [
      {
        // Baseline security headers applied to every response. Kept
        // narrow on purpose:
        //   - HSTS pins HTTPS for two years and includes subdomains so
        //     api.vidsandgifs.com inherits the policy. preload is
        //     intentionally omitted — the apex isn't on the HSTS
        //     preload list yet and adding it requires a separate
        //     submission step.
        //   - nosniff stops browsers from MIME-sniffing the signed
        //     /media/* responses (which always carry a correct
        //     Content-Type) into something executable.
        //   - Referrer-Policy keeps the path off cross-origin
        //     navigations so a private gif/video URL doesn't leak via
        //     Referer when a user clicks an external link.
        // Frame-ancestors is set per-route below so /embed/* can stay
        // wide-open while the rest of the app refuses framing.
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Clickjacking defense for the main app. Anything outside
        // /embed/* must not be framed by third parties — the JSON-LD
        // helper already neutralises script-tag breakouts, but
        // frame-ancestors closes the UI-redress angle that no amount
        // of escaping can prevent.
        // Source uses a negative-lookahead so /embed/* still matches
        // the wide-open rule below instead of inheriting 'self'.
        source: "/:path((?!embed/).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
        ],
      },
      {
        // The push service worker has to cover the whole site, not just
        // /. Service-Worker-Allowed: / lets it claim that scope even
        // though it's served from /sw.js. no-cache stops browsers from
        // pinning an old worker after a deploy.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Embed routes are explicitly designed to render inside iframes
        // on Twitter, Discord, etc. Default Next.js doesn't set a frame
        // policy, but some hosts (Railway proxy / Cloudflare) inject
        // X-Frame-Options: SAMEORIGIN by default which would break the
        // Twitter Player card. CSP frame-ancestors '*' is the modern
        // equivalent of "anyone may iframe this" — narrower than
        // wildcards we'd hand to a CSP for the rest of the app, since
        // these pages contain only a single <video>/<img> element.
        //
        // Cache-Control: a CDN in front of Railway (Cloudflare, etc.)
        // can cache the SSR output for a minute. Discord, Twitter, and
        // other unfurlers re-fetch the same /embed URL many times when
        // a link spreads — caching even briefly shaves real Railway
        // requests. stale-while-revalidate keeps clients fast across
        // the 1-min TTL boundary.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        // Sitemap response itself can be cached at the CDN for an hour;
        // Google fetches it daily but bots and link-validators hit it
        // far more often. The page-level `revalidate = 3600` controls
        // SSR; this header makes the CDN respect the same window.
        source: "/sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Static — never changes between deploys.
        source: "/robots.txt",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
      {
        // Web App Manifest. Browsers cache it on their own heuristics
        // (Chrome/Edge typically pin it for 24h once installed), but an
        // explicit policy makes the CDN serve repeat fetches without
        // hitting Next, and lets us cap the staleness window when an
        // icon or short_name actually changes.
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Favicon. Next emits it via app/icon.tsx; the redirect at
        // /favicon.ico already lands here. Safe to pin for a week.
        source: "/icon",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, immutable",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Permanent 301 from the legacy .xyz domain to .com so every URL
      // shared before the migration still resolves. Matches the apex
      // and www subdomain; the api subdomain is intentionally left out
      // (no end users hit api.vidsandgifs.xyz directly, and a 301 on a
      // tRPC request would just turn into a noisy client error). The
      // capture group on `:path*` preserves the rest of the URL so e.g.
      // /gifs/<id> on .xyz lands on /gifs/<id> on .com, not the home
      // page.
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "(www\\.)?vidsandgifs\\.xyz",
          },
        ],
        destination: "https://vidsandgifs.com/:path*",
        permanent: true,
      },
      // Old browsers + Safari probe /favicon.ico unconditionally; we ship
      // the favicon via app/icon.tsx (Next emits it at /icon). Without
      // this redirect, the probe 404s and pollutes the console on every
      // page load.
      { source: "/favicon.ico", destination: "/icon", permanent: false },
    ];
  },
};

export default nextConfig;
