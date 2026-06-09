import type { MetadataRoute } from "next";
import { SEO_PAGE_MAX } from "@repo/shared";
import { getServerTrpc } from "@/lib/trpc-server";
import { absoluteUrl } from "@/lib/site";
import { LISTING_PAGE_LIMIT } from "@/lib/seo-pagination";

// Static + ISR. Without this, Next ignores `revalidate` and SSRs the
// sitemap on every fetch — Google retrieves /sitemap.xml frequently
// enough that this was hitting the API once every visit.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const trpc = await getServerTrpc();

  let videos: Array<{ id: string; createdAt: string | Date }> = [];
  let videoCount = 0;
  let gifCount = 0;
  // GIF and screenshot detail pages now redirect anonymous viewers to
  // /login, so we deliberately don't include them in the sitemap —
  // Google flags sitemap entries that 30x as soft errors.
  try {
    [videos, videoCount, gifCount] = await Promise.all([
      trpc.videos.sitemap.query(),
      trpc.videos.countPublic.query(),
      trpc.gifs.countPublic.query(),
    ]);
  } catch {
    // If the API is briefly unavailable, ship the static entries rather
    // than a 500 — Google will retry the sitemap.
  }

  const now = new Date();

  // /videos and /gifs use a 20-per-page grid; /all interleaves both
  // streams so its longest page run is bounded by whichever list is
  // longer. Cap at SEO_PAGE_MAX so a runaway count doesn't balloon the
  // sitemap past Google's 50k-URL limit (also matches the API's input
  // validation — listing beyond that returns 400).
  const pagesFor = (count: number) =>
    Math.min(SEO_PAGE_MAX, Math.max(1, Math.ceil(count / LISTING_PAGE_LIMIT)));
  const videoPageCount = pagesFor(videoCount);
  const gifPageCount = pagesFor(gifCount);
  const allPageCount = Math.max(videoPageCount, gifPageCount);

  // Page 1 is the bare URL (already in staticEntries); only emit page
  // 2+ here so we don't duplicate the canonical landing URL.
  const paginatedEntries = (
    path: string,
    pageCount: number,
    priority: number,
  ): MetadataRoute.Sitemap =>
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => ({
      url: absoluteUrl(`${path}?page=${i + 2}`),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority,
    }));

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
      // Converter landings — public, no auth, with HowTo + FAQPage JSON-LD.
      // Target "gif to mp4 converter" / "mp4 to gif converter" queries that
      // the rest of the app shell can't compete for. Each is bilingual via
      // the /uk prefix; declare hreflang so Google indexes both.
      url: absoluteUrl("/tools/gif-to-mp4"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
      alternates: {
        languages: {
          en: absoluteUrl("/tools/gif-to-mp4"),
          uk: absoluteUrl("/uk/tools/gif-to-mp4"),
          "x-default": absoluteUrl("/tools/gif-to-mp4"),
        },
      },
    },
    {
      url: absoluteUrl("/tools/mp4-to-gif"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
      alternates: {
        languages: {
          en: absoluteUrl("/tools/mp4-to-gif"),
          uk: absoluteUrl("/uk/tools/mp4-to-gif"),
          "x-default": absoluteUrl("/tools/mp4-to-gif"),
        },
      },
    },
    {
      // Private library landing — SEO target for "private gif library" /
      // "telegram gif bot" / "discord gif bot" queries that the home page
      // is too brand-led to rank for directly.
      url: absoluteUrl("/private-gif-library"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
      alternates: {
        languages: {
          en: absoluteUrl("/private-gif-library"),
          uk: absoluteUrl("/uk/private-gif-library"),
          "x-default": absoluteUrl("/private-gif-library"),
        },
      },
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

  // SEO-friendly pagination URLs. Page 1 == bare URL (already above);
  // we enumerate page 2..N so Googlebot can reach every grid item
  // without depending on the JS infinite-scroll path. Mirrored at
  // runtime by ?page=N support in each route's `searchParams` handler.
  const paginatedListings: MetadataRoute.Sitemap = [
    ...paginatedEntries("/videos", videoPageCount, 0.6),
    ...paginatedEntries("/gifs", gifPageCount, 0.6),
    ...paginatedEntries("/all", allPageCount, 0.5),
  ];

  return [...staticEntries, ...paginatedListings, ...videoEntries];
}
