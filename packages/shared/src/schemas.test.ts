import { describe, expect, it } from "vitest";
import {
  MAX_GIF_BYTES,
  MAX_GIF_DURATION_SECONDS,
} from "./schemas";
import {
  MAX_VIDEO_BYTES,
  MAX_AVATAR_BYTES,
  MAX_SCREENSHOT_BYTES,
  MAX_AUDIO_BYTES,
} from "./constants";
import {
  createUploadInputSchema,
  finalizeUploadInputSchema,
  uploadVideoFromUrlInputSchema,
  uploadGifFromUrlInputSchema,
  createGifUploadInputSchema,
  finalizeGifUploadInputSchema,
  createScreenshotUploadInputSchema,
  createAvatarUploadInputSchema,
  createAudioUploadInputSchema,
  signUpInputSchema,
  signInInputSchema,
  confirmSignUpInputSchema,
  resendConfirmationInputSchema,
  tagNameSchema,
  listVideosInputSchema,
  searchVideosInputSchema,
  pushSubscribeInputSchema,
  videoIdInputSchema,
  usernameInputSchema,
  attachAudioInputSchema,
  billingCheckoutInputSchema,
} from "./schemas";

const VALID_UUID = "11111111-2222-4333-8444-555555555555";
const ANOTHER_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("tagNameSchema", () => {
  it.each([
    "tag",
    "Tag",
    "tag-with-dash",
    "abc123",
    "1tag",
  ])("accepts %s", (input) => {
    expect(tagNameSchema.parse(input)).toBe(input.trim());
  });

  it.each([
    "",
    "   ",
    "-leading-dash",
    "tag with space",
    "tag!",
    "русский",
    "a".repeat(33),
  ])("rejects %s", (input) => {
    expect(() => tagNameSchema.parse(input)).toThrow();
  });

  it("trims surrounding whitespace before validating", () => {
    expect(tagNameSchema.parse("  tag  ")).toBe("tag");
  });
});

describe("createUploadInputSchema", () => {
  const valid = {
    title: "My video",
    description: "Some description",
    tags: ["foo", "bar"],
    mimeType: "video/mp4",
    sizeBytes: 1_000_000,
    visibility: "public",
    downloadPolicy: "full",
  };

  it("accepts a valid input", () => {
    expect(createUploadInputSchema.parse(valid)).toMatchObject(valid);
  });

  it("supplies defaults for description, tags, visibility, downloadPolicy", () => {
    const parsed = createUploadInputSchema.parse({
      title: "Title",
      mimeType: "video/mp4",
      sizeBytes: 1000,
    });
    expect(parsed.description).toBe("");
    expect(parsed.tags).toEqual([]);
    expect(parsed.visibility).toBe("public");
    expect(parsed.downloadPolicy).toBe("full");
  });

  it("rejects empty title", () => {
    expect(() =>
      createUploadInputSchema.parse({ ...valid, title: "" }),
    ).toThrow();
  });

  it("rejects title >200 chars", () => {
    expect(() =>
      createUploadInputSchema.parse({ ...valid, title: "x".repeat(201) }),
    ).toThrow();
  });

  it("rejects unknown mimeType", () => {
    expect(() =>
      createUploadInputSchema.parse({ ...valid, mimeType: "video/avi" }),
    ).toThrow();
    expect(() =>
      createUploadInputSchema.parse({ ...valid, mimeType: "image/png" }),
    ).toThrow();
  });

  it("rejects negative sizeBytes", () => {
    expect(() =>
      createUploadInputSchema.parse({ ...valid, sizeBytes: -1 }),
    ).toThrow();
    expect(() =>
      createUploadInputSchema.parse({ ...valid, sizeBytes: 0 }),
    ).toThrow();
  });

  it("rejects sizeBytes over MAX_VIDEO_BYTES", () => {
    expect(() =>
      createUploadInputSchema.parse({ ...valid, sizeBytes: MAX_VIDEO_BYTES + 1 }),
    ).toThrow();
  });

  it("accepts sizeBytes exactly at MAX_VIDEO_BYTES", () => {
    expect(
      createUploadInputSchema.parse({ ...valid, sizeBytes: MAX_VIDEO_BYTES })
        .sizeBytes,
    ).toBe(MAX_VIDEO_BYTES);
  });

  it("rejects more than 20 tags", () => {
    expect(() =>
      createUploadInputSchema.parse({
        ...valid,
        tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
      }),
    ).toThrow();
  });

  it("rejects an invalid visibility value", () => {
    expect(() =>
      createUploadInputSchema.parse({ ...valid, visibility: "secret" }),
    ).toThrow();
  });

  it("rejects an invalid downloadPolicy value", () => {
    expect(() =>
      createUploadInputSchema.parse({ ...valid, downloadPolicy: "open" }),
    ).toThrow();
  });
});

describe("finalizeUploadInputSchema", () => {
  it("requires a uuid videoId", () => {
    expect(
      finalizeUploadInputSchema.parse({ videoId: VALID_UUID }),
    ).toMatchObject({ videoId: VALID_UUID, compressServerSide: false });
  });

  it("rejects a non-uuid videoId", () => {
    expect(() =>
      finalizeUploadInputSchema.parse({ videoId: "not-a-uuid" }),
    ).toThrow();
  });

  it("defaults compressServerSide to false", () => {
    const parsed = finalizeUploadInputSchema.parse({ videoId: VALID_UUID });
    expect(parsed.compressServerSide).toBe(false);
  });

  it("accepts an optional thumbnailS3Key", () => {
    const parsed = finalizeUploadInputSchema.parse({
      videoId: VALID_UUID,
      thumbnailS3Key: "videos/x/thumb.jpg",
    });
    expect(parsed.thumbnailS3Key).toBe("videos/x/thumb.jpg");
  });
});

describe("uploadVideoFromUrlInputSchema (SSRF input gate)", () => {
  const valid = {
    url: "https://example.com/video.mp4",
    title: "From URL",
  };

  it("accepts an https URL", () => {
    expect(uploadVideoFromUrlInputSchema.parse(valid).url).toBe(valid.url);
  });

  it("accepts an http URL (server-side guard handles the rest)", () => {
    expect(
      uploadVideoFromUrlInputSchema.parse({ ...valid, url: "http://example.com/video.mp4" })
        .url,
    ).toBe("http://example.com/video.mp4");
  });

  it("rejects a non-http(s) protocol", () => {
    for (const url of [
      "ftp://example.com/video.mp4",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:video/mp4;base64,xxx",
    ]) {
      expect(() =>
        uploadVideoFromUrlInputSchema.parse({ ...valid, url }),
      ).toThrow();
    }
  });

  it("rejects malformed URL strings", () => {
    expect(() =>
      uploadVideoFromUrlInputSchema.parse({ ...valid, url: "not a url" }),
    ).toThrow();
    expect(() =>
      uploadVideoFromUrlInputSchema.parse({ ...valid, url: "" }),
    ).toThrow();
  });

  it("rejects URLs longer than 2048 chars", () => {
    const url = "https://example.com/" + "a".repeat(2050);
    expect(() =>
      uploadVideoFromUrlInputSchema.parse({ ...valid, url }),
    ).toThrow();
  });

  it("trims surrounding whitespace before validating the URL", () => {
    const parsed = uploadVideoFromUrlInputSchema.parse({
      ...valid,
      url: "  https://example.com/video.mp4  ",
    });
    expect(parsed.url).toBe("https://example.com/video.mp4");
  });

  it("requires a non-empty title", () => {
    expect(() =>
      uploadVideoFromUrlInputSchema.parse({ ...valid, title: "" }),
    ).toThrow();
  });
});

describe("uploadGifFromUrlInputSchema", () => {
  const valid = {
    url: "https://example.com/clip.gif",
    title: "From URL",
  };

  it("accepts a minimal valid input", () => {
    expect(uploadGifFromUrlInputSchema.parse(valid).url).toBe(valid.url);
  });

  it("rejects javascript: URLs", () => {
    expect(() =>
      uploadGifFromUrlInputSchema.parse({
        ...valid,
        url: "javascript:alert(1)",
      }),
    ).toThrow();
  });
});

describe("createGifUploadInputSchema", () => {
  const valid = {
    title: "Loop",
    description: "",
    tags: [],
    sizeBytes: 1_000_000,
    durationSeconds: 5,
    visibility: "public",
  };

  it("accepts a valid input", () => {
    expect(createGifUploadInputSchema.parse(valid)).toMatchObject(valid);
  });

  it("rejects sizeBytes over MAX_GIF_BYTES", () => {
    expect(() =>
      createGifUploadInputSchema.parse({
        ...valid,
        sizeBytes: MAX_GIF_BYTES + 1,
      }),
    ).toThrow();
  });

  it("rejects durationSeconds well past the cap", () => {
    expect(() =>
      createGifUploadInputSchema.parse({
        ...valid,
        durationSeconds: MAX_GIF_DURATION_SECONDS + 5,
      }),
    ).toThrow();
  });

  it("accepts durationSeconds slightly over the cap (encoder rounding)", () => {
    expect(
      createGifUploadInputSchema.parse({
        ...valid,
        durationSeconds: MAX_GIF_DURATION_SECONDS + 0.4,
      }).durationSeconds,
    ).toBeCloseTo(MAX_GIF_DURATION_SECONDS + 0.4);
  });

  it("rejects zero or negative durationSeconds", () => {
    expect(() =>
      createGifUploadInputSchema.parse({ ...valid, durationSeconds: 0 }),
    ).toThrow();
    expect(() =>
      createGifUploadInputSchema.parse({ ...valid, durationSeconds: -1 }),
    ).toThrow();
  });
});

describe("finalizeGifUploadInputSchema", () => {
  it("requires a uuid gifId", () => {
    expect(
      finalizeGifUploadInputSchema.parse({ gifId: VALID_UUID }).gifId,
    ).toBe(VALID_UUID);
    expect(() =>
      finalizeGifUploadInputSchema.parse({ gifId: "abc" }),
    ).toThrow();
  });
});

describe("createScreenshotUploadInputSchema", () => {
  const valid = {
    title: "Frame",
    mimeType: "image/jpeg",
    sizeBytes: 100_000,
    width: 1280,
    height: 720,
  };

  it("accepts a valid input with defaults", () => {
    const parsed = createScreenshotUploadInputSchema.parse(valid);
    expect(parsed.visibility).toBe("public");
    expect(parsed.source).toBe("manual");
  });

  it("rejects unsupported MIME types", () => {
    expect(() =>
      createScreenshotUploadInputSchema.parse({ ...valid, mimeType: "image/gif" }),
    ).toThrow();
  });

  it("rejects sizeBytes over MAX_SCREENSHOT_BYTES", () => {
    expect(() =>
      createScreenshotUploadInputSchema.parse({
        ...valid,
        sizeBytes: MAX_SCREENSHOT_BYTES + 1,
      }),
    ).toThrow();
  });

  it("rejects dimensions over 8192 px", () => {
    expect(() =>
      createScreenshotUploadInputSchema.parse({ ...valid, width: 8193 }),
    ).toThrow();
    expect(() =>
      createScreenshotUploadInputSchema.parse({ ...valid, height: 8193 }),
    ).toThrow();
  });

  it("rejects zero / negative dimensions", () => {
    expect(() =>
      createScreenshotUploadInputSchema.parse({ ...valid, width: 0 }),
    ).toThrow();
    expect(() =>
      createScreenshotUploadInputSchema.parse({ ...valid, height: -1 }),
    ).toThrow();
  });
});

describe("createAvatarUploadInputSchema", () => {
  it("accepts allowed image types within size cap", () => {
    expect(
      createAvatarUploadInputSchema.parse({
        mimeType: "image/jpeg",
        sizeBytes: 100_000,
      }),
    ).toMatchObject({ mimeType: "image/jpeg", sizeBytes: 100_000 });
  });

  it("rejects oversized avatars", () => {
    expect(() =>
      createAvatarUploadInputSchema.parse({
        mimeType: "image/png",
        sizeBytes: MAX_AVATAR_BYTES + 1,
      }),
    ).toThrow();
  });
});

describe("createAudioUploadInputSchema", () => {
  it("accepts allowed audio types", () => {
    expect(
      createAudioUploadInputSchema.parse({
        title: "BGM",
        mimeType: "audio/mpeg",
        sizeBytes: 1_000_000,
      }),
    ).toMatchObject({ mimeType: "audio/mpeg" });
  });

  it("rejects unsupported audio types", () => {
    expect(() =>
      createAudioUploadInputSchema.parse({
        title: "BGM",
        mimeType: "audio/flac",
        sizeBytes: 1_000_000,
      }),
    ).toThrow();
  });

  it("rejects sizeBytes over MAX_AUDIO_BYTES", () => {
    expect(() =>
      createAudioUploadInputSchema.parse({
        title: "BGM",
        mimeType: "audio/mpeg",
        sizeBytes: MAX_AUDIO_BYTES + 1,
      }),
    ).toThrow();
  });

  it("accepts an optional durationSeconds within bound", () => {
    expect(
      createAudioUploadInputSchema.parse({
        title: "BGM",
        mimeType: "audio/mpeg",
        sizeBytes: 1000,
        durationSeconds: 60,
      }).durationSeconds,
    ).toBe(60);
  });

  it("rejects durationSeconds over 1 hour", () => {
    expect(() =>
      createAudioUploadInputSchema.parse({
        title: "BGM",
        mimeType: "audio/mpeg",
        sizeBytes: 1000,
        durationSeconds: 60 * 60 + 1,
      }),
    ).toThrow();
  });
});

describe("signUpInputSchema", () => {
  const valid = {
    email: "Foo@Example.COM",
    name: "Foo Bar",
    password: "supersecret",
  };

  it("lower-cases the email", () => {
    expect(signUpInputSchema.parse(valid).email).toBe("foo@example.com");
  });

  it("rejects malformed emails", () => {
    expect(() =>
      signUpInputSchema.parse({ ...valid, email: "not-an-email" }),
    ).toThrow();
  });

  it("rejects passwords shorter than 8 chars", () => {
    expect(() =>
      signUpInputSchema.parse({ ...valid, password: "1234567" }),
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      signUpInputSchema.parse({ ...valid, name: "" }),
    ).toThrow();
  });

  it("rejects passwords over 200 chars", () => {
    expect(() =>
      signUpInputSchema.parse({ ...valid, password: "a".repeat(201) }),
    ).toThrow();
  });
});

describe("signInInputSchema", () => {
  it("requires email + password", () => {
    expect(
      signInInputSchema.parse({ email: "a@b.co", password: "x" }),
    ).toMatchObject({ email: "a@b.co", password: "x" });
  });

  it("lower-cases the email", () => {
    expect(
      signInInputSchema.parse({ email: "A@B.CO", password: "x" }).email,
    ).toBe("a@b.co");
  });

  it("rejects empty password", () => {
    expect(() =>
      signInInputSchema.parse({ email: "a@b.co", password: "" }),
    ).toThrow();
  });
});

describe("confirmSignUpInputSchema + resendConfirmationInputSchema", () => {
  it("confirmSignUp requires a token of reasonable length", () => {
    expect(
      confirmSignUpInputSchema.parse({ token: "a".repeat(20) }).token,
    ).toBe("a".repeat(20));
    expect(() =>
      confirmSignUpInputSchema.parse({ token: "short" }),
    ).toThrow();
  });

  it("resendConfirmation requires a valid email", () => {
    expect(
      resendConfirmationInputSchema.parse({ email: "x@y.co" }).email,
    ).toBe("x@y.co");
    expect(() =>
      resendConfirmationInputSchema.parse({ email: "nope" }),
    ).toThrow();
  });
});

describe("listVideosInputSchema + searchVideosInputSchema", () => {
  it("defaults limit and sort", () => {
    const parsed = listVideosInputSchema.parse({});
    expect(parsed.limit).toBe(24);
    expect(parsed.sort).toBe("newest");
  });

  it("clamps limit by min/max", () => {
    expect(() => listVideosInputSchema.parse({ limit: 0 })).toThrow();
    expect(() => listVideosInputSchema.parse({ limit: 51 })).toThrow();
  });

  it("rejects non-uuid cursor", () => {
    expect(() =>
      listVideosInputSchema.parse({ cursor: "not-a-uuid" }),
    ).toThrow();
  });

  it("searchVideos defaults q and tag to empty strings", () => {
    const parsed = searchVideosInputSchema.parse({});
    expect(parsed.q).toBe("");
    expect(parsed.tag).toBe("");
  });

  it("searchVideos enforces sort enum", () => {
    expect(() =>
      searchVideosInputSchema.parse({ sort: "trending" }),
    ).toThrow();
  });
});

describe("pushSubscribeInputSchema", () => {
  const valid = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    p256dh: "BPpxxx",
    auth: "yyy",
  };

  it("accepts a valid push subscription", () => {
    expect(pushSubscribeInputSchema.parse(valid)).toMatchObject(valid);
  });

  it("rejects a non-URL endpoint", () => {
    expect(() =>
      pushSubscribeInputSchema.parse({ ...valid, endpoint: "not-a-url" }),
    ).toThrow();
  });
});

describe("videoIdInputSchema + usernameInputSchema + attachAudioInputSchema + billingCheckoutInputSchema", () => {
  it("videoIdInputSchema requires uuid", () => {
    expect(videoIdInputSchema.parse({ id: VALID_UUID }).id).toBe(VALID_UUID);
    expect(() => videoIdInputSchema.parse({ id: "abc" })).toThrow();
  });

  it("usernameInputSchema enforces handle shape and case-folds", () => {
    expect(usernameInputSchema.parse({ username: "FooBar" }).username).toBe(
      "foobar",
    );
    expect(() => usernameInputSchema.parse({ username: "no" })).toThrow();
    expect(() => usernameInputSchema.parse({ username: "has space" })).toThrow();
  });

  it("attachAudioInputSchema clamps volume to [0,1]", () => {
    expect(() =>
      attachAudioInputSchema.parse({
        videoId: VALID_UUID,
        audioTemplateId: ANOTHER_UUID,
        startSeconds: 0,
        volume: 1.5,
      }),
    ).toThrow();
    expect(() =>
      attachAudioInputSchema.parse({
        videoId: VALID_UUID,
        audioTemplateId: ANOTHER_UUID,
        startSeconds: 0,
        volume: -0.1,
      }),
    ).toThrow();
  });

  it("billingCheckoutInputSchema requires absolute path", () => {
    expect(
      billingCheckoutInputSchema.parse({ successPath: "/billing" }).successPath,
    ).toBe("/billing");
    expect(() =>
      billingCheckoutInputSchema.parse({ successPath: "billing" }),
    ).toThrow();
  });
});
