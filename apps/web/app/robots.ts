import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // `/api/oembed` is the public endpoint Slack/Notion/Trello fetch
        // to unfurl a video/gif/screenshot page — every /videos/[id],
        // /gifs/[id], /screenshots/[id] renders a <link rel="alternate"
        // type="application/json+oembed"> pointing at it. Blocking it
        // (as the previous blanket /api/ rule did) meant crawlers
        // couldn't follow the discovery link, and Search Console
        // flagged the referring pages. `/api/auth/` (next-auth
        // callbacks) stays blocked — it's not content and crawler
        // hits there are wasted budget.
        disallow: [
          "/confirm",
          "/api/auth/",
          "/favorites",
          "/screenshots/",
          "/folders",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
