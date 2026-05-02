export const MAX_VIDEO_BYTES = Math.round(1.5 * 1024 ** 3);
export const MAX_VIDEO_GB = 1.5;
// Cap the *post-compression* upload payload. Even a long video transcoded
// to 480p shouldn't blow past this — anything bigger almost always means
// the trim/quality settings need adjusting.
export const MAX_VIDEO_OUTPUT_BYTES = 300 * 1024 * 1024;
export const MAX_VIDEO_OUTPUT_MB = 300;
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

// Per-user daily quota for video uploads. Whichever cap is hit first blocks
// further uploads until the rolling 24-hour window slides forward.
export const DAILY_VIDEO_UPLOAD_LIMIT = 10;
export const DAILY_VIDEO_BYTES_LIMIT = 1024 ** 3; // 1 GiB
export const DAILY_VIDEO_BYTES_LIMIT_GB = 1;

// Cap on how many of each media kind an *unverified* user can upload before
// they must confirm their email. The server emits an error whose message
// starts with this prefix so the client can detect it and pop a "verify
// your email" dialog instead of showing a generic toast.
export const UNVERIFIED_VIDEO_LIMIT = 1;
export const UNVERIFIED_GIF_LIMIT = 1;
export const UNVERIFIED_SCREENSHOT_LIMIT = 1;
export const UNVERIFIED_LIMIT_ERROR_PREFIX = "UNVERIFIED_LIMIT:";

// Once an account is verified but not yet *approved* by an admin, these
// looser caps apply per rolling 24h. They sit between the unverified
// hard cap (1 of each, total) and the verified+approved cap
// (DAILY_VIDEO_UPLOAD_LIMIT). The server emits an error with the prefix
// below so the client can show a "waiting on admin approval" message.
export const UNAPPROVED_DAILY_VIDEO_LIMIT = 5;
export const UNAPPROVED_DAILY_GIF_LIMIT = 5;
export const UNAPPROVED_DAILY_SCREENSHOT_LIMIT = 10;
export const UNAPPROVED_LIMIT_ERROR_PREFIX = "UNAPPROVED_LIMIT:";

// Anonymous viewers (no account) can open up to this many distinct
// video/gif pages per IP per rolling 24h before the API forces a sign-in.
// Reloads of the same item don't re-burn quota, so a user binging one
// long video isn't punished. The server emits an error with the prefix
// below so the SSR page can swap in a "sign up to keep watching" CTA
// instead of a generic notFound.
export const ANON_DAILY_VIEW_LIMIT = 50;
export const ANON_VIEW_LIMIT_ERROR_PREFIX = "ANON_VIEW_LIMIT:";

// Per-IP egress cap on the /media/ streaming endpoint over a rolling 24h
// window. Real wallet protection — without this, a single anon viewer
// can re-fetch a signed URL hourly and loop the same video to drain S3
// egress. 5 GB/day is well above what a normal heavy viewer hits (480p
// is ~2-5 MB/min, so 5 GB ≈ 15+ hours of viewing).
export const MEDIA_DAILY_BYTES_PER_IP = 5 * 1024 ** 3;
// Per-IP req/min cap on /media/. 200 is generous for a video page that
// fires range requests on seek but cuts off any sustained loop attack.
export const MEDIA_REQUESTS_PER_MINUTE_PER_IP = 200;

// How many seconds an anonymous viewer can watch before the player
// pauses and shows a sign-in CTA. They get a real preview, but the
// expensive tail of a long video stays gated until they sign in.
export const ANON_VIDEO_PREVIEW_SECONDS = 30;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const;

export const ALLOWED_THUMBNAIL_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_SCREENSHOT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedScreenshotMimeType =
  (typeof ALLOWED_SCREENSHOT_MIME_TYPES)[number];

// 10 MB feels generous for a still frame; the editor produces JPEGs that
// are well under 1 MB at typical resolutions.
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_OUTPUT_SIZE = 512;

// Audio templates a user can layer on top of their videos.
export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg", // .mp3
  "audio/mp4", // .m4a
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
] as const;
export type AllowedAudioMimeType = (typeof ALLOWED_AUDIO_MIME_TYPES)[number];

export const AUDIO_EXT_BY_MIME: Record<AllowedAudioMimeType, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_AUDIO_MB = 20;

export type AllowedVideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];
export type AllowedThumbnailMimeType =
  (typeof ALLOWED_THUMBNAIL_MIME_TYPES)[number];
export type AllowedAvatarMimeType = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];
