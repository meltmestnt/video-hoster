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
// the visitor's Accept-Language (or the `?lang=` override) so an English
// query gets an English snippet and a Ukrainian one gets Ukrainian.
const HOME_COPY: Record<
  Locale,
  { title: string; description: string; ogTitle: string; ogDescription: string }
> = {
  en: {
    title:
      "vids & gifs — your private GIFs and videos in every chat (Telegram + Discord), GIF ↔ MP4 converter",
    description:
      "vids & gifs (vidsandgifs.com) is your private library of GIFs and videos that lives across Telegram and Discord. Curate folders only you can see, then send from any chat — @vidsandgifsbot inline picker on Telegram, /gif slash command with autocomplete on Discord, same library on both. Free in-browser GIF ↔ MP4 conversion is included for feeding your library. No installs, no ads.",
    ogTitle:
      "vids & gifs — private GIFs and videos, every chat (Telegram + Discord)",
    ogDescription:
      "One private library of GIFs and videos, sendable inline from Telegram and Discord — plus a free in-browser GIF ↔ MP4 converter. vidsandgifs.com.",
  },
  uk: {
    title:
      "vids & gifs — твої приватні GIF і відео у кожному чаті (Telegram + Discord), конвертер GIF ↔ MP4",
    description:
      "vids & gifs (vidsandgifs.com) — твоя приватна бібліотека GIF і відео, що працює і в Telegram, і в Discord. Складай у папки, які бачиш лише ти, і надсилай з будь-якого чату — інлайн-пікер @vidsandgifsbot у Telegram, слеш-команда /gif з автодоповненням у Discord, одна бібліотека на обох. Безкоштовний конвертер GIF ↔ MP4 у браузері — додатковий спосіб поповнити бібліотеку. Без встановлення, без реклами.",
    ogTitle:
      "vids & gifs — приватні GIF і відео, кожен чат (Telegram + Discord)",
    ogDescription:
      "Одна приватна бібліотека GIF і відео — інлайн з Telegram і Discord. Плюс безкоштовний конвертер GIF ↔ MP4 у браузері. vidsandgifs.com.",
  },
};

const HOME_LOCALE_URL: Record<Locale, string> = {
  en: absoluteUrl("/"),
  uk: absoluteUrl("/?lang=uk"),
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
      <DiscordPromoBanner />
      <FolderOnboardingBanner />
      <DropTile mode="any" signedIn />
      <Dashboard initial={initial} initialGifs={initialGifs} sort={sort} />
    </>
  );
}
