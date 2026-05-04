import type { MetadataRoute } from "next";
import { getServerTrpc } from "@/lib/trpc-server";
import { absoluteUrl } from "@/lib/site";

// Static + ISR. Without this, Next ignores `revalidate` and SSRs the
// sitemap on every fetch — Google retrieves /sitemap.xml frequently
// enough that this was hitting the API once every visit.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const trpc = await getServerTrpc();

  let videos: Array<{ id: string; createdAt: string | Date }> = [];
  // GIF and screenshot detail pages now redirect anonymous viewers to
  // /login, so we deliberately don't include them in the sitemap —
  // Google flags sitemap entries that 30x as soft errors.
  try {
    [videos] = await Promise.all([trpc.videos.sitemap.query()]);
  } catch {
    // If the API is briefly unavailable, ship the static entries rather
    // than a 500 — Google will retry the sitemap.
  }

  const now = new Date();

  // Each bilingual page is listed once at the English URL with the
  // Ukrainian variant declared in `alternates.languages`. Google reads
  // those alongside the rendered hreflang tags and indexes `/uk` (and
  // `/uk/...`) as the Ukrainian counterpart of the same canonical entry.
  // The `/uk` prefix is rewritten by middleware to the underlying route
  // with the locale set, so both URLs render the same page in different
  // languages.
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
      alternates: {
        languages: {
          en: absoluteUrl("/"),
          uk: absoluteUrl("/uk"),
          "x-default": absoluteUrl("/"),
        },
      },
    },
    {
      url: absoluteUrl("/search"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: absoluteUrl("/videos"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/gifs"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      // Static FAQ page — content rarely changes but worth a high-ish
      // priority because it's the page targeting "what is a gif" /
      // "how to convert gif to mp4" search queries. Both English and
      // Ukrainian Q&A blocks render on the same URL, so we deliberately
      // omit hreflang alternates (Google would collapse identical-bytes
      // alternates into a single canonical anyway). The bilingual page
      // ranks for queries in either language because both bodies of
      // text are present in the rendered HTML.
      url: absoluteUrl("/faq"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const videoEntries: MetadataRoute.Sitemap = videos.map((v) => ({
    url: absoluteUrl(`/videos/${v.id}`),
    lastModified: new Date(v.createdAt),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticEntries, ...videoEntries];
}
