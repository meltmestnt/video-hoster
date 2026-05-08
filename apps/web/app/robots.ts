import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/videos/", "/search", "/gifs/", "/signup", "/faq"],
        // /gifs/ and /screenshots/ both redirect anonymous viewers to
        // /login now, so disallow crawling them — Google would otherwise
        // log every URL as a soft 404.
        disallow: [
          "/login",
          "/confirm",
          "/api/",
          "/favorites",
          "/screenshots/",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
