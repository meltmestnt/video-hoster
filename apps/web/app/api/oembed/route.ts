import { NextResponse } from "next/server";
import { getServerTrpc } from "@/lib/trpc-server";
import { siteUrl, absoluteUrl } from "@/lib/site";

// oEmbed endpoint Slack, Notion, Trello, and a few other consumers fetch
// after they discover the <link rel="alternate" type="application/json+oembed">
// tag we render on /videos/[id], /gifs/[id], and /screenshots/[id]. Returning
// `type: "video"` with an iframe HTML string is what makes Slack render an
// inline player instead of a plain link card.
//
// Spec: https://oembed.com/
//
// Slack-specific notes:
// - Slack only fetches oEmbed when the response advertises "type":"video" or
//   "type":"photo". "rich" works too but Slack's renderer is pickier with it.
// - The iframe HTML must include explicit width/height attributes; Slack
//   rejects the embed when they're missing.

interface OEmbedVideoResponse {
  type: "video";
  version: "1.0";
  title: string;
  author_name: string;
  author_url: string;
  provider_name: string;
  provider_url: string;
  width: number;
  height: number;
  html: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

interface OEmbedPhotoResponse {
  type: "photo";
  version: "1.0";
  title: string;
  author_name: string;
  author_url: string;
  provider_name: string;
  provider_url: string;
  url: string;
  width: number;
  height: number;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

type OEmbedResponse = OEmbedVideoResponse | OEmbedPhotoResponse;

// Hard-coded fallback dimensions when we don't have width/height stored.
// Picked to match the embed iframe metadata in the page generators.
const VIDEO_W = 1280;
const VIDEO_H = 720;
const GIF_FALLBACK_SIZE = 480;
const SCREENSHOT_FALLBACK_W = 1280;
const SCREENSHOT_FALLBACK_H = 720;

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) return jsonError(400, "missing url param");

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return jsonError(400, "url is not a valid URL");
  }

  // Reject cross-origin requests so this can't be used as an open
  // proxy that returns oEmbed for arbitrary other hosts.
  const ours = new URL(siteUrl());
  if (parsed.host !== ours.host) {
    return jsonError(400, "url not handled by this provider");
  }

  // Match the path against the three resource shapes we support. Any
  // trailing slash or query is allowed.
  const path = parsed.pathname.replace(/\/+$/, "");
  const videoMatch = path.match(/^\/videos\/([^/]+)$/);
  const gifMatch = path.match(/^\/gifs\/([^/]+)$/);
  const shotMatch = path.match(/^\/screenshots\/([^/]+)$/);

  const trpc = await getServerTrpc();

  if (videoMatch) {
    const id = videoMatch[1];
    try {
      const v = await trpc.videos.byId.query({ id });
      if (v.visibility === "private" || !v.videoUrl) {
        return jsonError(404, "not found");
      }
      const embedUrl = absoluteUrl(`/embed/v/${v.id}`);
      const body: OEmbedVideoResponse = {
        type: "video",
        version: "1.0",
        title: v.title,
        author_name: v.owner.name,
        author_url: ours.origin,
        provider_name: "vids&gifs",
        provider_url: ours.origin,
        width: VIDEO_W,
        height: VIDEO_H,
        html: `<iframe src="${embedUrl}" width="${VIDEO_W}" height="${VIDEO_H}" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`,
        thumbnail_url: v.thumbnailUrl ?? undefined,
      };
      return NextResponse.json(body);
    } catch {
      return jsonError(404, "not found");
    }
  }

  if (gifMatch) {
    const id = gifMatch[1];
    try {
      const g = await trpc.gifs.byId.query({ id });
      if (g.visibility === "private" || !g.gifUrl) {
        return jsonError(404, "not found");
      }
      const body: OEmbedPhotoResponse = {
        type: "photo",
        version: "1.0",
        title: g.title,
        author_name: g.owner.name,
        author_url: ours.origin,
        provider_name: "vids&gifs",
        provider_url: ours.origin,
        url: g.gifUrl,
        width: GIF_FALLBACK_SIZE,
        height: GIF_FALLBACK_SIZE,
        thumbnail_url: g.gifUrl,
      };
      return NextResponse.json(body);
    } catch {
      return jsonError(404, "not found");
    }
  }

  if (shotMatch) {
    const id = shotMatch[1];
    try {
      const s = await trpc.screenshots.byId.query({ id });
      if (s.visibility === "private" || !s.url) {
        return jsonError(404, "not found");
      }
      const body: OEmbedPhotoResponse = {
        type: "photo",
        version: "1.0",
        title: s.title,
        author_name: s.owner.name,
        author_url: ours.origin,
        provider_name: "vids&gifs",
        provider_url: ours.origin,
        url: s.url,
        width: s.width ?? SCREENSHOT_FALLBACK_W,
        height: s.height ?? SCREENSHOT_FALLBACK_H,
        thumbnail_url: s.url,
      };
      return NextResponse.json(body);
    } catch {
      return jsonError(404, "not found");
    }
  }

  return jsonError(404, "url is not a known resource");
}
