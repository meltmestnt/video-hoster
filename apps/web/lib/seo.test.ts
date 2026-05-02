import { describe, expect, it } from "vitest";
import {
  buildMediaDescription,
  buildSearchDescription,
  type MediaDescriptionArgs,
} from "./seo";

const BASE: MediaDescriptionArgs = {
  kind: "video",
  title: "Title",
  ownerName: "Alice",
  tags: [],
  createdAt: "2026-04-15T00:00:00Z",
};

describe("buildMediaDescription — uploader-supplied", () => {
  it("uses the user's description verbatim when supplied", () => {
    expect(
      buildMediaDescription({
        ...BASE,
        description: "Hand-written description from the uploader.",
      }),
    ).toBe("Hand-written description from the uploader.");
  });

  it("trims surrounding whitespace before deciding it's non-empty", () => {
    // A whitespace-only description should NOT win — it should fall
    // through to the synthesized form.
    const out = buildMediaDescription({ ...BASE, description: "   \n  " });
    expect(out).not.toBe("   \n  ");
    expect(out).toContain("Title");
  });

  it("truncates a very long user description with an ellipsis", () => {
    const long = "x ".repeat(200) + "tail";
    const out = buildMediaDescription({ ...BASE, description: long });
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildMediaDescription — synthesized fallback", () => {
  it("leads with the title in quotes followed by media kind + owner", () => {
    const out = buildMediaDescription(BASE);
    expect(out.startsWith(`"Title" — Video by Alice on vids&gifs.`)).toBe(true);
  });

  it("formats the kind lead as 'Animated GIF' for kind=gif", () => {
    const out = buildMediaDescription({ ...BASE, kind: "gif" });
    expect(out).toContain("Animated GIF by Alice");
  });

  it("uses second-precision duration for short videos", () => {
    const out = buildMediaDescription({ ...BASE, durationSeconds: 15 });
    expect(out).toContain("15-second video");
  });

  it("rolls duration up to minutes for longer videos", () => {
    expect(
      buildMediaDescription({ ...BASE, durationSeconds: 120 }),
    ).toContain("2-minute video");
    expect(
      buildMediaDescription({ ...BASE, durationSeconds: 95 }),
    ).toContain("1m 35s video");
  });

  it("ignores duration for kind=gif (the kind lead is fixed)", () => {
    const out = buildMediaDescription({
      ...BASE,
      kind: "gif",
      durationSeconds: 10,
    });
    expect(out).toContain("Animated GIF");
    expect(out).not.toContain("10-second");
  });

  it("includes up to 3 tags as a comma-separated list", () => {
    const out = buildMediaDescription({
      ...BASE,
      tags: [{ name: "cats" }, { name: "dance" }, { name: "loop" }],
    });
    expect(out).toContain("Tagged: cats, dance, loop.");
  });

  it("caps tag list at 3 even when more are supplied", () => {
    const out = buildMediaDescription({
      ...BASE,
      tags: [
        { name: "cats" },
        { name: "dance" },
        { name: "loop" },
        { name: "extra" },
      ],
    });
    expect(out).toContain("Tagged: cats, dance, loop.");
    expect(out).not.toContain("extra");
  });

  it("omits the tag clause when no tags are supplied", () => {
    expect(buildMediaDescription(BASE)).not.toContain("Tagged:");
  });

  it("includes view count when > 0 (formatted with K/M)", () => {
    expect(
      buildMediaDescription({ ...BASE, viewCount: 1500 }),
    ).toContain("1.5K views");
    expect(
      buildMediaDescription({ ...BASE, viewCount: 12_300_000 }),
    ).toContain("12M views");
    expect(
      buildMediaDescription({ ...BASE, viewCount: 250 }),
    ).toContain("250 views");
  });

  it("includes like count when > 0", () => {
    expect(buildMediaDescription({ ...BASE, likeCount: 42 })).toContain(
      "42 likes",
    );
  });

  it("omits the stats clause when both counts are 0", () => {
    const out = buildMediaDescription({
      ...BASE,
      viewCount: 0,
      likeCount: 0,
    });
    expect(out).not.toContain("views");
    expect(out).not.toContain("likes");
  });

  it("appends the upload month/year", () => {
    const out = buildMediaDescription({
      ...BASE,
      createdAt: "2026-04-15T00:00:00Z",
    });
    expect(out).toMatch(/Uploaded April 2026\./);
  });

  it("truncates the synthesized form to <=160 chars with an ellipsis", () => {
    const out = buildMediaDescription({
      ...BASE,
      title: "x".repeat(180),
      tags: [{ name: "a" }, { name: "b" }, { name: "c" }],
      viewCount: 9999,
      likeCount: 9999,
    });
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildSearchDescription", () => {
  const empty = { q: "", tag: "", videoCount: 0, gifCount: 0, hasMore: false };

  it("falls back to a generic blurb with no q and no tag", () => {
    expect(buildSearchDescription(empty)).toMatch(/Search videos and GIFs/);
  });

  it("renders a tag-only browse line", () => {
    expect(
      buildSearchDescription({
        q: "",
        tag: "cats",
        videoCount: 4,
        gifCount: 6,
        hasMore: false,
      }),
    ).toContain("10 cats videos and GIFs");
  });

  it("uses '+' suffix when hasMore is true", () => {
    const out = buildSearchDescription({
      q: "",
      tag: "cats",
      videoCount: 24,
      gifCount: 24,
      hasMore: true,
    });
    expect(out).toContain("48+");
  });

  it("renders the empty tag case with #tag", () => {
    expect(
      buildSearchDescription({
        q: "",
        tag: "rare",
        videoCount: 0,
        gifCount: 0,
        hasMore: false,
      }),
    ).toBe("Browse #rare videos and GIFs on vids&gifs.");
  });

  it("renders q-only with totals", () => {
    expect(
      buildSearchDescription({
        q: "loop",
        tag: "",
        videoCount: 3,
        gifCount: 5,
        hasMore: false,
      }),
    ).toContain('8 results for "loop"');
  });

  it("renders the no-match q-only line", () => {
    expect(
      buildSearchDescription({
        q: "qqqqqqq",
        tag: "",
        videoCount: 0,
        gifCount: 0,
        hasMore: false,
      }),
    ).toBe(`No matches for "qqqqqqq" on vids&gifs.`);
  });

  it("renders q + tag combination", () => {
    expect(
      buildSearchDescription({
        q: "spin",
        tag: "cats",
        videoCount: 1,
        gifCount: 2,
        hasMore: false,
      }),
    ).toContain('matches for "spin" tagged #cats');
  });

  it("never exceeds 160 chars", () => {
    const big = buildSearchDescription({
      q: "x".repeat(80),
      tag: "y".repeat(30),
      videoCount: 10,
      gifCount: 10,
      hasMore: true,
    });
    expect(big.length).toBeLessThanOrEqual(160);
  });
});
