export const MAX_VIDEO_BYTES = Math.round(1.5 * 1024 ** 3);
export const MAX_VIDEO_GB = 1.5;
// Cap the *post-compression* upload payload. Even a long video transcoded
// to 480p shouldn't blow past this — anything bigger almost always means
// the trim/quality settings need adjusting.
export const MAX_VIDEO_OUTPUT_BYTES = 300 * 1024 * 1024;
export const MAX_VIDEO_OUTPUT_MB = 300;
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

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

export const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_OUTPUT_SIZE = 512;

export type AllowedVideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];
export type AllowedThumbnailMimeType =
  (typeof ALLOWED_THUMBNAIL_MIME_TYPES)[number];
export type AllowedAvatarMimeType = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];
