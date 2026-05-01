import { z } from "zod";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  ALLOWED_SCREENSHOT_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_AVATAR_BYTES,
  MAX_SCREENSHOT_BYTES,
  MAX_VIDEO_BYTES,
} from "./constants";

export const tagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "Tags can only contain letters, numbers, and dashes");

export const videoVisibilitySchema = z.enum(["public", "private"]);
export type VideoVisibility = z.infer<typeof videoVisibilitySchema>;

export const createUploadInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  tags: z.array(tagNameSchema).max(20).default([]),
  mimeType: z.enum(ALLOWED_VIDEO_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES, {
    message: `File exceeds the ${MAX_VIDEO_BYTES} byte limit (1.5 GiB)`,
  }),
  visibility: videoVisibilitySchema.default("public"),
});
export type CreateUploadInput = z.infer<typeof createUploadInputSchema>;

export const finalizeUploadInputSchema = z.object({
  videoId: z.string().uuid(),
  // Set when the client couldn't transcode in-browser (ffmpeg.wasm failure or
  // OOM) and uploaded the original file instead — the server will re-encode.
  compressServerSide: z.boolean().default(false),
  // Optional client-supplied thumbnail. The S3 key was returned by createUpload
  // and the client PUT a JPEG to it. If absent, the server falls back to
  // generating a thumbnail from the video itself.
  thumbnailS3Key: z.string().min(1).max(256).optional(),
});
export type FinalizeUploadInput = z.infer<typeof finalizeUploadInputSchema>;

export const videoIdInputSchema = z.object({
  id: z.string().uuid(),
});

export const videoSortSchema = z
  .enum(["newest", "mostLiked", "mostDisliked"])
  .default("newest");
export type VideoSort = z.infer<typeof videoSortSchema>;

export const listVideosInputSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(24),
  sort: videoSortSchema,
});

export const searchVideosInputSchema = z.object({
  q: z.string().trim().max(200).default(""),
  tag: z.string().trim().max(32).default(""),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(24),
  sort: videoSortSchema,
});
export type SearchVideosInput = z.infer<typeof searchVideosInputSchema>;

export const reactToVideoInputSchema = z.object({
  videoId: z.string().uuid(),
  type: z.enum(["like", "dislike"]),
});
export type ReactToVideoInput = z.infer<typeof reactToVideoInputSchema>;

export const MAX_GIF_BYTES = 20 * 1024 * 1024;
export const MAX_GIF_DURATION_SECONDS = 20;

export const createGifUploadInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  tags: z.array(tagNameSchema).max(20).default([]),
  sizeBytes: z.number().int().positive().max(MAX_GIF_BYTES, {
    message: `GIF exceeds ${MAX_GIF_BYTES} byte limit (20 MB)`,
  }),
  durationSeconds: z
    .number()
    .positive()
    .max(MAX_GIF_DURATION_SECONDS + 0.5),
  visibility: videoVisibilitySchema.default("public"),
});
export type CreateGifUploadInput = z.infer<typeof createGifUploadInputSchema>;

export const finalizeGifUploadInputSchema = z.object({
  gifId: z.string().uuid(),
});
export type FinalizeGifUploadInput = z.infer<typeof finalizeGifUploadInputSchema>;

export const gifIdInputSchema = z.object({ id: z.string().uuid() });

export const reactToGifInputSchema = z.object({
  gifId: z.string().uuid(),
  type: z.enum(["like", "dislike"]),
});
export type ReactToGifInput = z.infer<typeof reactToGifInputSchema>;

export const listGifsInputSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(24),
  sort: videoSortSchema,
});

export const searchGifsInputSchema = z.object({
  q: z.string().trim().max(200).default(""),
  tag: z.string().trim().max(32).default(""),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(24),
  sort: videoSortSchema,
});
export type SearchGifsInput = z.infer<typeof searchGifsInputSchema>;

export const createScreenshotUploadInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALLOWED_SCREENSHOT_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_SCREENSHOT_BYTES, {
    message: `Screenshot exceeds ${MAX_SCREENSHOT_BYTES} byte limit`,
  }),
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  visibility: videoVisibilitySchema.default("public"),
  source: z
    .enum(["video", "gif", "manual"])
    .default("manual"),
});
export type CreateScreenshotUploadInput = z.infer<
  typeof createScreenshotUploadInputSchema
>;

export const finalizeScreenshotUploadInputSchema = z.object({
  screenshotId: z.string().uuid(),
});
export type FinalizeScreenshotUploadInput = z.infer<
  typeof finalizeScreenshotUploadInputSchema
>;

export const screenshotIdInputSchema = z.object({ id: z.string().uuid() });

export const listScreenshotsInputSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(24),
  ownerId: z.string().uuid().optional(),
});
export type ListScreenshotsInput = z.infer<
  typeof listScreenshotsInputSchema
>;


export const commentSortSchema = z
  .enum(["newest", "mostLiked", "mostDisliked"])
  .default("newest");
export type CommentSort = z.infer<typeof commentSortSchema>;

export const listCommentsInputSchema = z.object({
  id: z.string().uuid(),
  sort: commentSortSchema,
});
export type ListCommentsInput = z.infer<typeof listCommentsInputSchema>;

export const reactToCommentInputSchema = z.object({
  commentId: z.string().uuid(),
  type: z.enum(["like", "dislike"]),
});
export type ReactToCommentInput = z.infer<typeof reactToCommentInputSchema>;

export const setMiniPlayerPreferenceInputSchema = z.object({
  enabled: z.boolean(),
});
export type SetMiniPlayerPreferenceInput = z.infer<
  typeof setMiniPlayerPreferenceInputSchema
>;

export const setNotifySubscribersOnUploadInputSchema = z.object({
  enabled: z.boolean(),
});
export type SetNotifySubscribersOnUploadInput = z.infer<
  typeof setNotifySubscribersOnUploadInputSchema
>;

export const userIdInputSchema = z.object({
  userId: z.string().uuid(),
});
export type UserIdInput = z.infer<typeof userIdInputSchema>;

export const listSubscriptionsInputSchema = z.object({
  userId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(24),
});
export type ListSubscriptionsInput = z.infer<
  typeof listSubscriptionsInputSchema
>;

export const toggleFavoriteInputSchema = z.object({
  videoId: z.string().uuid(),
});
export type ToggleFavoriteInput = z.infer<typeof toggleFavoriteInputSchema>;

export const listFavoritesInputSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(24),
});
export type ListFavoritesInput = z.infer<typeof listFavoritesInputSchema>;

export const createCommentInputSchema = z.object({
  videoId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;

export const updateCommentInputSchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});
export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>;

export const commentIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type CommentIdInput = z.infer<typeof commentIdInputSchema>;

export const tagSearchInputSchema = z.object({
  q: z.string().trim().max(32).default(""),
  limit: z.number().int().min(1).max(20).default(10),
});

export const signUpInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});
export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const signInInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});
export type SignInInput = z.infer<typeof signInInputSchema>;

export const confirmSignUpInputSchema = z.object({
  token: z.string().min(16).max(256),
});
export type ConfirmSignUpInput = z.infer<typeof confirmSignUpInputSchema>;

export const createAvatarUploadInputSchema = z.object({
  mimeType: z.enum(ALLOWED_AVATAR_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_AVATAR_BYTES, {
    message: `Avatar exceeds ${MAX_AVATAR_BYTES} byte limit`,
  }),
});
export type CreateAvatarUploadInput = z.infer<
  typeof createAvatarUploadInputSchema
>;

export const finalizeAvatarUploadInputSchema = z.object({
  s3Key: z.string().min(1).max(256),
});
export type FinalizeAvatarUploadInput = z.infer<
  typeof finalizeAvatarUploadInputSchema
>;

export const createGifCommentInputSchema = z.object({
  gifId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});
export type CreateGifCommentInput = z.infer<typeof createGifCommentInputSchema>;

export const listGifCommentsInputSchema = z.object({
  id: z.string().uuid(),
  sort: commentSortSchema,
});

export const listNotificationsInputSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListNotificationsInput = z.infer<
  typeof listNotificationsInputSchema
>;

export const notificationIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type NotificationIdInput = z.infer<typeof notificationIdInputSchema>;
