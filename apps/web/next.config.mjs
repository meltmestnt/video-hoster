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
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/trpc/:path*", destination: "http://localhost:4000/trpc/:path*" },
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
