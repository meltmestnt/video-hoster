// Builders for SERP-friendly description strings.
//
// Most GIFs and videos on the site ship with no description, so the
// metadata that Google sees is whatever fallback we hand it. The naive
// fallback ("GIF \"X\" by Bob on vids&gifs.") is ~30 chars and gives
// search engines almost nothing to weight. These helpers stitch
// together the title, owner, tags, stats, and upload month into a
// natural-reading description that lands in the 130–160 char sweet
// spot Google likes — without resorting to keyword stuffing.

const MAX_DESCRIPTION_LEN = 160;
const MAX_TAGS_IN_DESC = 3;

export interface MediaDescriptionArgs {
  kind: "gif" | "video";
  title: string;
  description?: string | null;
  ownerName: string;
  tags: { name: string }[];
  durationSeconds?: number | null;
  viewCount?: number | null;
  likeCount?: number | null;
  createdAt: Date | string;
}

/**
 * If the uploader supplied a real description, that wins (truncated to
 * the meta-description limit). Otherwise we synthesize one from the
 * structured fields the page already has. The synthesized form leads
 * with the title (in quotes — survives query matching), then media kind
 * + owner, then tags as a comma list, then stats, then upload month.
 * Stats are dropped silently when zero so the line doesn't read like a
 * dead profile.
 */
export function buildMediaDescription(args: MediaDescriptionArgs): string {
  const userDesc = args.description?.trim();
  if (userDesc) {
    return truncate(userDesc, MAX_DESCRIPTION_LEN);
  }

  const tagList = args.tags
    .map((t) => t.name.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS_IN_DESC);

  const kindLead =
    args.kind === "video" && args.durationSeconds && args.durationSeconds > 0
      ? `${formatDuration(args.durationSeconds)} video`
      : args.kind === "video"
      ? "Video"
      : "Animated GIF";

  const head = `"${args.title}" — ${kindLead} by ${args.ownerName} on vids&gifs.`;
  const tagPart = tagList.length > 0 ? ` Tagged: ${tagList.join(", ")}.` : "";

  const stats: string[] = [];
  if ((args.viewCount ?? 0) > 0) {
    stats.push(`${formatCount(args.viewCount!)} ${args.viewCount === 1 ? "view" : "views"}`);
  }
  if ((args.likeCount ?? 0) > 0) {
    stats.push(`${formatCount(args.likeCount!)} ${args.likeCount === 1 ? "like" : "likes"}`);
  }
  const statsPart = stats.length > 0 ? ` ${stats.join(", ")}.` : "";

  const monthYear = new Date(args.createdAt).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const datePart = ` Uploaded ${monthYear}.`;

  return truncate(head + tagPart + statsPart + datePart, MAX_DESCRIPTION_LEN);
}

export interface SearchDescriptionArgs {
  q: string;
  tag: string;
  videoCount: number;
  gifCount: number;
  hasMore: boolean;
}

/**
 * Search-page descriptions vary by what the user is filtering on.
 * Tag pages are indexable and worth a real evergreen blurb; free-form
 * queries are noindex but the snippet still surfaces in browser tabs
 * and shares so we still want a clean string.
 */
export function buildSearchDescription(args: SearchDescriptionArgs): string {
  const { q, tag, videoCount, gifCount, hasMore } = args;
  const total = videoCount + gifCount;
  const totalLabel = hasMore ? `${total}+` : `${total}`;

  if (tag && !q) {
    if (total === 0) {
      return `Browse #${tag} videos and GIFs on vids&gifs.`;
    }
    return truncate(
      `${totalLabel} ${tag} videos and GIFs on vids&gifs — ${videoCount} videos and ${gifCount} GIFs tagged "${tag}", uploaded by the community.`,
      MAX_DESCRIPTION_LEN,
    );
  }

  if (q && tag) {
    if (total === 0) {
      return `No matches for "${q}" tagged #${tag} on vids&gifs.`;
    }
    return truncate(
      `${totalLabel} matches for "${q}" tagged #${tag} on vids&gifs — videos and GIFs uploaded by the community.`,
      MAX_DESCRIPTION_LEN,
    );
  }

  if (q) {
    if (total === 0) {
      return `No matches for "${q}" on vids&gifs.`;
    }
    return truncate(
      `${totalLabel} results for "${q}" on vids&gifs — ${videoCount} videos and ${gifCount} GIFs matching your search.`,
      MAX_DESCRIPTION_LEN,
    );
  }

  return "Search videos and GIFs by title or tag on vids&gifs — short clips and animated GIFs uploaded by the community.";
}

/**
 * Serialize a JSON-LD object for inlining inside `<script type="application/ld+json">`.
 * `JSON.stringify` does not escape `<` or `</`, so a user-supplied title containing
 * `</script>` would break out of the script tag. Replace the unsafe sequences with
 * their unicode escapes, which the JSON parser accepts and which the HTML parser
 * cannot misread as tag boundaries or comment delimiters.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/[\u2028\u2029]/g, (c) =>
      c === "\u2028" ? "\\u2028" : "\\u2029",
    );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  // Trim back to the last full word so we don't end with half a token,
  // then add an ellipsis. Floor of (max - 1) keeps room for it.
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}K`;
  }
  return String(n);
}

function formatDuration(seconds: number): string {
  const total = Math.max(1, Math.round(seconds));
  if (total < 60) return `${total}-second`;
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}-minute`;
}
