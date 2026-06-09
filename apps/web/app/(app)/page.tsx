import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { Dashboard } from "@/components/Dashboard";
import { VideoSortSelect } from "@/components/VideoSortSelect";
import { AnonymousIntro } from "@/components/AnonymousIntro";
import { DropTile } from "@/components/DropTile";
import { TelegramPromoBanner } from "@/components/TelegramPromoBanner";
import { DiscordPromoBanner } from "@/components/DiscordPromoBanner";
import { FolderOnboardingBanner } from "@/components/FolderOnboardingBanner";
import { SeoPagination } from "@/components/SeoPagination";
import type { VideoSort } from "@repo/shared";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";
import { LISTING_PAGE_LIMIT, parsePageParam } from "@/lib/seo-pagination";

// Anonymous visitors return early with a static-friendly intro panel —
// no DB calls, no session-dependent UI — so we don't force-mark this
// route dynamic. Next.js detects the cookie/searchParams reads downstream
// and switches to dynamic rendering automatically when a session exists,
// while letting the anon path stay cheap.

// The root path is the natural landing for any "vids and gifs" /
// "vidsandgifs" search, so we use `title.absolute` here to break out of
// the layout's "%s — vids&gifs" template and lead with the brand. Both
// strings stay inside Google's SERP-rendered limits — title under ~65
// chars, description under ~155 — so the snippet doesn't get truncated
// mid-phrase. The page itself carries the long-form pitch.
const HOME_COPY: Record<
  Locale,
  { title: string; description: string; ogTitle: string; ogDescription: string }
> = {
  en: {
    title: "vids & gifs — private GIFs and videos in every chat",
    description:
      "vids & gifs: your private library of GIFs and videos, sendable inline from any Telegram or Discord chat. Free in-browser GIF ↔ MP4 converter.",
    ogTitle:
      "vids & gifs — private GIFs and videos, every chat (Telegram + Discord)",
    ogDescription:
      "One private library of GIFs and videos, sendable inline from Telegram and Discord — plus a free in-browser GIF ↔ MP4 converter. vidsandgifs.com.",
  },
  uk: {
    title: "vids & gifs — приватні GIF і відео у кожному чаті",
    description:
      "vids & gifs: твоя приватна бібліотека GIF і відео, інлайн з будь-якого чату Telegram або Discord. Безкоштовний конвертер GIF ↔ MP4 у браузері.",
    ogTitle:
      "vids & gifs — приватні GIF і відео, кожен чат (Telegram + Discord)",
    ogDescription:
      "Одна приватна бібліотека GIF і відео — інлайн з Telegram і Discord. Плюс безкоштовний конвертер GIF ↔ MP4 у браузері. vidsandgifs.com.",
  },
};

const HOME_LOCALE_URL: Record<Locale, string> = {
  en: absoluteUrl("/"),
  uk: absoluteUrl("/uk"),
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const copy = HOME_COPY[locale];
  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: {
      canonical: HOME_LOCALE_URL[locale],
      languages: {
        en: HOME_LOCALE_URL.en,
        uk: HOME_LOCALE_URL.uk,
        "x-default": HOME_LOCALE_URL.en,
      },
    },
    openGraph: {
      title: copy.ogTitle,
      description: copy.ogDescription,
      url: HOME_LOCALE_URL[locale],
      type: "website",
      locale: locale === "uk" ? "uk_UA" : "en_US",
      alternateLocale: locale === "uk" ? ["en_US"] : ["uk_UA"],
    },
  };
}

const VALID_SORTS: VideoSort[] = ["newest", "mostLiked", "mostDisliked"];
function normalizeSort(raw: string | undefined): VideoSort {
  return (VALID_SORTS as string[]).includes(raw ?? "")
    ? (raw as VideoSort)
    : "newest";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const session = await getServerSession(authOptions);
  // Signed-out visitors see the marketing landing instead of the feed —
  // they can still browse content via the "Browse all videos" link or by
  // navigating to /videos / /gifs / /screenshots directly. Note that
  // this also means ?page=N on / is meaningless for SEO: bots get the
  // intro. The crawlable paginated surface is /all (which mirrors this
  // feed for anonymous viewers too) — sitemap entries point at that.
  if (!session?.user) {
    return <AnonymousIntro />;
  }

  const { sort: sortRaw, page: pageRaw } = await searchParams;
  const sort = normalizeSort(sortRaw);
  const page = parsePageParam(pageRaw);

  const trpc = await getServerTrpc();
  const pagedInput = page > 1 ? { page } : {};
  const [initial, initialGifs] = await Promise.all([
    trpc.videos.list.query({ limit: LISTING_PAGE_LIMIT, sort, ...pagedInput }),
    trpc.gifs.list.query({ limit: LISTING_PAGE_LIMIT, sort, ...pagedInput }),
  ]);
  const hasNextPage = !!initial.nextCursor || !!initialGifs.nextCursor;

  return (
    <>
      <div className="page-header">
        <Flex align="end" justify="between" gap="3" wrap="wrap" mb="5">
          <div>
            <Heading size="6" mb="1">
              <T k="page.dashboard.heading" />
            </Heading>
            <Text as="p" color="gray" size="2">
              <T k="page.dashboard.subtitle" />
            </Text>
          </div>
          <VideoSortSelect value={sort} />
        </Flex>
      </div>
      <TelegramPromoBanner />
      <DiscordPromoBanner />
      <FolderOnboardingBanner />
      <DropTile mode="any" signedIn />
      <Dashboard
        initial={initial}
        initialGifs={initialGifs}
        sort={sort}
        initialPage={page}
      />
      <SeoPagination path="/" page={page} hasNextPage={hasNextPage} />
    </>
  );
}
