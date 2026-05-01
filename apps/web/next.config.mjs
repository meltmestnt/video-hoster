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
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Old browsers + Safari probe /favicon.ico unconditionally; we ship
      // the favicon via app/icon.tsx (Next emits it at /icon). Without
      // this redirect, the probe 404s and pollutes the console on every
      // page load.
      { source: "/favicon.ico", destination: "/icon", permanent: false },
    ];
  },
};

export default nextConfig;
