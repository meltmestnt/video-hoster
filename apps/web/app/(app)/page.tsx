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
import type { VideoSort } from "@repo/shared";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

// The root path is the natural landing for any "vids and gifs" /
// "vidsandgifs" search, so we use `title.absolute` here to break out of
// the layout's "%s — vids&gifs" template and lead with the brand and
// every common spelling. Description repeats them in plain prose so the
// SERP snippet (which Google often pulls verbatim from this string)
// reads like a description of what the site does — localized to match
// the visitor's Accept-Language so an English query gets an English
// snippet and a Ukrainian one gets Ukrainian.
const HOME_COPY: Record<
  Locale,
  { title: string; description: string; ogTitle: string; ogDescription: string }
> = {
  en: {
    title:
      "vids & gifs — upload videos and GIFs, convert MP4 to GIF, share in your browser",
    description:
      "vids & gifs (vidsandgifs.xyz) lets you upload videos and GIFs, convert MP4 to GIF, extract audio, capture screenshots from any frame, and share them publicly or privately. Free, no installs, runs in your browser. Browse the latest community uploads or sign up to post your own.",
    ogTitle:
      "vids & gifs — upload videos and GIFs, convert, share in your browser",
    ogDescription:
      "Upload videos and GIFs, convert MP4 to GIF, extract audio, capture screenshots, and share. Free in-browser tools at vidsandgifs.xyz.",
  },
  uk: {
    title:
      "vids & gifs — завантажуй відео і GIF, конвертуй MP4 у GIF, ділись у браузері",
    description:
      "vids & gifs (vidsandgifs.xyz) дозволяє завантажувати відео й GIF, конвертувати MP4 у GIF, витягувати аудіо, зберігати кадри як скріншоти і ділитися ними публічно чи приватно. Безкоштовно, без встановлення, працює прямо в браузері. Переглядай останні завантаження спільноти або зареєструйся, щоб публікувати своє.",
    ogTitle:
      "vids & gifs — завантажуй відео і GIF, конвертуй, ділись у браузері",
    ogDescription:
      "Завантажуй відео і GIF, конвертуй MP4 у GIF, витягуй аудіо, зберігай скріншоти й ділись. Безкоштовні інструменти у браузері на vidsandgifs.xyz.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const copy = HOME_COPY[locale];
  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: { canonical: absoluteUrl("/") },
    openGraph: {
      title: copy.ogTitle,
      description: copy.ogDescription,
      url: absoluteUrl("/"),
      type: "website",
      locale: locale === "uk" ? "uk_UA" : "en_US",
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
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await getServerSession(authOptions);
  // Signed-out visitors see the marketing landing instead of the feed —
  // they can still browse content via the "Browse all videos" link or by
  // navigating to /videos / /gifs / /screenshots directly.
  if (!session?.user) {
    return <AnonymousIntro />;
  }

  const { sort: sortRaw } = await searchParams;
  const sort = normalizeSort(sortRaw);

  const trpc = await getServerTrpc();
  const [initial, initialGifs] = await Promise.all([
    trpc.videos.list.query({ limit: 20, sort }),
    trpc.gifs.list.query({ limit: 20, sort }),
  ]);

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
      <DropTile mode="any" signedIn />
      <Dashboard initial={initial} initialGifs={initialGifs} sort={sort} />
    </>
  );
}
