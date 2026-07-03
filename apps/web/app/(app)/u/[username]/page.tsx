import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import {
  Avatar,
  Badge,
  Box,
  Flex,
  Heading,
  Tabs,
  Text,
} from "@radix-ui/themes";
import { getServerTrpc, getSession } from "@/lib/trpc-server";
import { absoluteUrl } from "@/lib/site";
import { VideoCard } from "@/components/VideoCard";
import { GifCard } from "@/components/GifCard";
import { ScreenshotCard } from "@/components/ScreenshotCard";
import { SubscribeButton } from "@/components/SubscribeButton";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;

function normalizeUsername(raw: string): string | null {
  // Next.js routes catch the path segment as-is. Decoding handles a stray
  // %40 sneaking past the rewrite, and we lowercase to match the DB.
  let lower: string;
  try {
    lower = decodeURIComponent(raw).toLowerCase();
  } catch {
    return null;
  }
  if (lower.startsWith("@")) lower = lower.slice(1);
  if (!USERNAME_RE.test(lower)) return null;
  return lower;
}

// Dedupe the profile fetch within a single request — generateMetadata
// and the page component both need it, and without React.cache() they'd
// each fire the tRPC round-trip (findByUsername + 5 counts + avatar) for
// a doubled ~14 DB queries per profile view.
const getProfile = cache(async (slug: string) => {
  const trpc = await getServerTrpc();
  return trpc.users.profile.query({ username: slug });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const slug = normalizeUsername(username);
  if (!slug) {
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }
  let profile;
  try {
    profile = await getProfile(slug);
  } catch {
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }
  const description = `Videos, GIFs, and screenshots uploaded by ${profile.name} on vids&gifs.`;
  const canonical = absoluteUrl(`/@${profile.username}`);
  return {
    title: `${profile.name} (@${profile.username})`,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title: `${profile.name} (@${profile.username})`,
      description,
      url: canonical,
      images: profile.avatarUrl ? [{ url: profile.avatarUrl }] : undefined,
    },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const slug = normalizeUsername(username);
  if (!slug) notFound();

  const session = await getSession();

  let profile;
  try {
    profile = await getProfile(slug);
  } catch {
    notFound();
  }

  // Fetch the three lists in parallel. Each endpoint already filters
  // private items unless the viewer is the owner, so we don't need a
  // second pass here.
  const trpc = await getServerTrpc();
  const [videos, gifs, screenshots] = await Promise.all([
    trpc.videos.byOwner.query({ ownerId: profile.id, limit: 24 }),
    trpc.gifs.byOwner.query({ ownerId: profile.id, limit: 24 }),
    trpc.screenshots.list.query({ ownerId: profile.id, limit: 24 }),
  ]);

  const isSelf = session?.user?.id === profile.id;
  const joined = new Date(profile.createdAt).toLocaleDateString();

  return (
    <Box>
      <Flex
        align="center"
        gap="4"
        wrap="wrap"
        mb="5"
        style={{
          padding: 16,
          borderRadius: "var(--radius-3)",
          background: "var(--gray-2)",
          border: "1px solid var(--gray-4)",
        }}
      >
        <Avatar
          size="6"
          src={profile.avatarUrl ?? undefined}
          fallback={profile.name.slice(0, 1).toUpperCase()}
          radius="full"
        />
        <Box style={{ flex: 1, minWidth: 240 }}>
          <Flex align="center" gap="2" wrap="wrap">
            <Heading size="6" style={{ wordBreak: "break-word" }}>
              {profile.name}
            </Heading>
            {profile.role === "admin" && (
              <Badge color="iris" variant="solid" radius="full">
                <T k="manage.role.admin" />
              </Badge>
            )}
          </Flex>
          <Text as="div" size="2" color="gray">
            @{profile.username}
          </Text>
          <Flex gap="3" mt="2" wrap="wrap">
            <Text size="2" color="gray">
              <T
                k="profile.stats.videos"
                vars={{ n: profile.counts.videos }}
              />
            </Text>
            <Text size="2" color="gray">·</Text>
            <Text size="2" color="gray">
              <T k="profile.stats.gifs" vars={{ n: profile.counts.gifs }} />
            </Text>
            <Text size="2" color="gray">·</Text>
            <Text size="2" color="gray">
              <T
                k="profile.stats.screenshots"
                vars={{ n: profile.counts.screenshots }}
              />
            </Text>
            <Text size="2" color="gray">·</Text>
            <Text size="2" color="gray">
              <T
                k="profile.stats.followers"
                vars={{ n: profile.followerCount }}
              />
            </Text>
            <Text size="2" color="gray">·</Text>
            <Text size="2" color="gray">
              <T k="profile.stats.joined" vars={{ date: joined }} />
            </Text>
            {profile.counts.gifsViaTelegram > 0 && (
              <>
                <Text size="2" color="gray">·</Text>
                <Text size="2" color="gray">
                  <T
                    k="profile.stats.viaTelegram"
                    vars={{ n: profile.counts.gifsViaTelegram }}
                  />
                </Text>
              </>
            )}
          </Flex>
        </Box>
        {!isSelf && session?.user && (
          <SubscribeButton targetUserId={profile.id} hideForSelf={false} />
        )}
      </Flex>

      <Tabs.Root defaultValue="videos">
        <Tabs.List>
          <Tabs.Trigger value="videos">
            <T k="profile.tab.videos" />
            {" "}({profile.counts.videos})
          </Tabs.Trigger>
          <Tabs.Trigger value="gifs">
            <T k="profile.tab.gifs" />
            {" "}({profile.counts.gifs})
          </Tabs.Trigger>
          <Tabs.Trigger value="screenshots">
            <T k="profile.tab.screenshots" />
            {" "}({profile.counts.screenshots})
          </Tabs.Trigger>
        </Tabs.List>

        <Box pt="4">
          <Tabs.Content value="videos">
            {videos.items.length === 0 ? (
              <ProfileEmpty messageKey="profile.empty.videos" />
            ) : (
              <div className="dashboard-grid">
                {videos.items.map((v, i) => (
                  <VideoCard key={v.id} video={v} index={i} />
                ))}
              </div>
            )}
          </Tabs.Content>
          <Tabs.Content value="gifs">
            {gifs.items.length === 0 ? (
              <ProfileEmpty messageKey="profile.empty.gifs" />
            ) : (
              <div className="dashboard-grid">
                {gifs.items.map((g, i) => (
                  <GifCard key={g.id} gif={g} index={i} />
                ))}
              </div>
            )}
          </Tabs.Content>
          <Tabs.Content value="screenshots">
            {screenshots.items.length === 0 ? (
              <ProfileEmpty messageKey="profile.empty.screenshots" />
            ) : (
              <div className="dashboard-grid">
                {screenshots.items.map((s) => (
                  <ScreenshotCard key={s.id} shot={s} />
                ))}
              </div>
            )}
          </Tabs.Content>
        </Box>
      </Tabs.Root>
    </Box>
  );
}

function ProfileEmpty({
  messageKey,
}: {
  messageKey:
    | "profile.empty.videos"
    | "profile.empty.gifs"
    | "profile.empty.screenshots";
}) {
  return (
    <Flex
      align="center"
      justify="center"
      style={{
        padding: "48px 24px",
        background: "var(--gray-2)",
        borderRadius: "var(--radius-3)",
        border: "1px dashed var(--gray-5)",
      }}
    >
      <Text color="gray">
        <T k={messageKey} />
      </Text>
    </Flex>
  );
}
