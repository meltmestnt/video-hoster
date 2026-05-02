import { z } from "zod";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  ALLOWED_AVATAR_MIME_TYPES,
  ALLOWED_SCREENSHOT_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_AUDIO_BYTES,
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

export const videoDownloadPolicySchema = z.enum(["full", "audio", "none"]);
export type VideoDownloadPolicy = z.infer<typeof videoDownloadPolicySchema>;

export const createUploadInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  tags: z.array(tagNameSchema).max(20).default([]),
  mimeType: z.enum(ALLOWED_VIDEO_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES, {
    message: `File exceeds the ${MAX_VIDEO_BYTES} byte limit (1.5 GiB)`,
  }),
  visibility: videoVisibilitySchema.default("public"),
  downloadPolicy: videoDownloadPolicySchema.default("full"),
});
export type CreateUploadInput = z.infer<typeof createUploadInputSchema>;

// Server-side ingestion from a remote URL. The user pastes a link,
// the API fetches it (with SSRF guards), validates magic bytes, and
// runs it through the same finalize pipeline as a normal upload. URL
// length cap matches Web Push and other URL fields elsewhere; 2048 is
// well above any realistic media URL.
export const uploadVideoFromUrlInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(2048)
    .refine((s) => /^https?:\/\//i.test(s), {
      message: "URL must use http or https",
    }),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  tags: z.array(tagNameSchema).max(20).default([]),
  visibility: videoVisibilitySchema.default("public"),
  downloadPolicy: videoDownloadPolicySchema.default("full"),
});
export type UploadVideoFromUrlInput = z.infer<
  typeof uploadVideoFromUrlInputSchema
>;

export const uploadGifFromUrlInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(2048)
    .refine((s) => /^https?:\/\//i.test(s), {
      message: "URL must use http or https",
    }),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  tags: z.array(tagNameSchema).max(20).default([]),
  visibility: videoVisibilitySchema.default("public"),
  // Optional folder to drop the new gif into. The server validates
  // ownership before adding the membership row.
  folderId: z.string().uuid().optional().nullable(),
});
export type UploadGifFromUrlInput = z.infer<typeof uploadGifFromUrlInputSchema>;

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
  // Optional folder to add the freshly-finalized gif to. Same shape as
  // uploadGifFromUrl — keeps the two web upload paths symmetric.
  folderId: z.string().uuid().optional().nullable(),
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

export const adminListUsersInputSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(120).optional(),
});
export type AdminListUsersInput = z.infer<typeof adminListUsersInputSchema>;

export const SUBSCRIPTION_TIERS = ["free", "pro"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const billingCheckoutInputSchema = z.object({
  // Where Stripe sends the user back. Both must be absolute URLs on the
  // configured WEB_ORIGIN; the server enforces that to keep this from
  // becoming an open redirect.
  successPath: z.string().startsWith("/").max(200).default("/billing"),
  cancelPath: z.string().startsWith("/").max(200).default("/billing"),
});
export type BillingCheckoutInput = z.infer<typeof billingCheckoutInputSchema>;

export const billingPortalInputSchema = z.object({
  returnPath: z.string().startsWith("/").max(200).default("/billing"),
});
export type BillingPortalInput = z.infer<typeof billingPortalInputSchema>;

export const SUBSCRIPTION_STATUSES = [
  "inactive",
  "trialing",
  "active",
  "past_due",
  "canceled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

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

export const resendConfirmationInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export type ResendConfirmationInput = z.infer<
  typeof resendConfirmationInputSchema
>;

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

// ─── Push notifications ───
// Mirrors the W3C PushSubscription.toJSON() output. Endpoint length is
// generous because Apple's Web Push endpoints can run >300 chars.
export const pushSubscribeInputSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(256),
  userAgent: z.string().max(512).nullable().optional(),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeInputSchema>;

export const pushUnsubscribeInputSchema = z.object({
  endpoint: z.string().url().max(2048),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeInputSchema>;

// ─── Public profile pages ───
// 3–32 chars, lowercase ASCII letters/digits/_/- only — matches the
// shape produced by UsersService.ensureUsername.
export const usernameInputSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_-]+$/),
});
export type UsernameInput = z.infer<typeof usernameInputSchema>;

export const listByOwnerInputSchema = z.object({
  ownerId: z.string().uuid(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(24),
});
export type ListByOwnerInput = z.infer<typeof listByOwnerInputSchema>;

// Hover-card listing of who reacted with a given type to a video/gif.
// Capped at 30 — anything past that is summarized as "+N more" by the
// client; there's no pagination beyond the first page because the use
// case is a quick on-hover preview, not a full audience browser.
export const reactorsInputSchema = z.object({
  type: z.enum(["like", "dislike"]),
  limit: z.number().int().min(1).max(30).default(12),
});
export const videoReactorsInputSchema = reactorsInputSchema.extend({
  videoId: z.string().uuid(),
});
export type VideoReactorsInput = z.infer<typeof videoReactorsInputSchema>;
export const gifReactorsInputSchema = reactorsInputSchema.extend({
  gifId: z.string().uuid(),
});
export type GifReactorsInput = z.infer<typeof gifReactorsInputSchema>;

// ─── Audio templates ───
export const createAudioUploadInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  mimeType: z.enum(ALLOWED_AUDIO_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_BYTES, {
    message: `Audio exceeds ${MAX_AUDIO_BYTES} byte limit`,
  }),
  durationSeconds: z.number().positive().max(60 * 60).optional(),
});
export type CreateAudioUploadInput = z.infer<
  typeof createAudioUploadInputSchema
>;

export const finalizeAudioUploadInputSchema = z.object({
  audioTemplateId: z.string().uuid(),
});
export type FinalizeAudioUploadInput = z.infer<
  typeof finalizeAudioUploadInputSchema
>;

export const audioTemplateIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type AudioTemplateIdInput = z.infer<
  typeof audioTemplateIdInputSchema
>;

export const attachAudioInputSchema = z.object({
  videoId: z.string().uuid(),
  audioTemplateId: z.string().uuid(),
  startSeconds: z.number().min(0).max(60 * 60).default(0),
  volume: z.number().min(0).max(1).default(1),
});
export type AttachAudioInput = z.infer<typeof attachAudioInputSchema>;

export const updateAudioTrackInputSchema = z.object({
  trackId: z.string().uuid(),
  startSeconds: z.number().min(0).max(60 * 60).optional(),
  volume: z.number().min(0).max(1).optional(),
});
export type UpdateAudioTrackInput = z.infer<
  typeof updateAudioTrackInputSchema
>;

export const audioTrackIdInputSchema = z.object({
  trackId: z.string().uuid(),
});
export type AudioTrackIdInput = z.infer<typeof audioTrackIdInputSchema>;

export const setMainAudioMutedInputSchema = z.object({
  videoId: z.string().uuid(),
  muted: z.boolean(),
});
export type SetMainAudioMutedInput = z.infer<
  typeof setMainAudioMutedInputSchema
>;
