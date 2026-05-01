import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  commentIdInputSchema,
  confirmSignUpInputSchema,
  resendConfirmationInputSchema,
  createAvatarUploadInputSchema,
  createCommentInputSchema,
  createUploadInputSchema,
  finalizeAvatarUploadInputSchema,
  finalizeUploadInputSchema,
  listCommentsInputSchema,
  listFavoritesInputSchema,
  listVideosInputSchema,
  reactToCommentInputSchema,
  reactToVideoInputSchema,
  reactToGifInputSchema,
  searchVideosInputSchema,
  searchGifsInputSchema,
  setMiniPlayerPreferenceInputSchema,
  createGifUploadInputSchema,
  finalizeGifUploadInputSchema,
  gifIdInputSchema,
  listGifsInputSchema,
  createGifCommentInputSchema,
  listGifCommentsInputSchema,
  createScreenshotUploadInputSchema,
  finalizeScreenshotUploadInputSchema,
  listScreenshotsInputSchema,
  screenshotIdInputSchema,
  listNotificationsInputSchema,
  listSubscriptionsInputSchema,
  notificationIdInputSchema,
  setNotifySubscribersOnUploadInputSchema,
  userIdInputSchema,
  createAudioUploadInputSchema,
  finalizeAudioUploadInputSchema,
  audioTemplateIdInputSchema,
  attachAudioInputSchema,
  updateAudioTrackInputSchema,
  audioTrackIdInputSchema,
  setMainAudioMutedInputSchema,
  signInInputSchema,
  signUpInputSchema,
  tagSearchInputSchema,
  toggleFavoriteInputSchema,
  updateCommentInputSchema,
  videoIdInputSchema,
  adminListUsersInputSchema,
  billingCheckoutInputSchema,
  pushSubscribeInputSchema,
  pushUnsubscribeInputSchema,
  usernameInputSchema,
  listByOwnerInputSchema,
  videoReactorsInputSchema,
  gifReactorsInputSchema,
} from "@repo/shared";
import {
  router,
  publicProcedure,
  protectedProcedure,
  verifiedProcedure,
  adminProcedure,
} from "./trpc";
import { rateLimit } from "./rate-limit";
import { enforceAnonView } from "./anon-view-limit";
import { Logger } from "@nestjs/common";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// Dedicated logger so traffic lines are easy to grep in Railway. Format
// stays key=value (matches the rest of the codebase) so a `grep ip=…`
// or `grep blocked=anon-view-limit` filters cleanly.
const trafficLog = new Logger("Traffic");

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      const videoCount = await ctx.services.videos.countByOwner(ctx.user.id);
      const avatarUrl = await ctx.services.users.resolveAvatarUrl(ctx.user);
      return {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        // The URL-safe handle for /@profile. ensureUsername runs on every
        // auth context, so this is populated for any user that has hit
        // the API since the column was added — onModuleInit also
        // backfills the rest at startup.
        username: ctx.user.username ?? null,
        avatarUrl,
        status: ctx.user.status,
        role: ctx.user.role,
        approved: ctx.user.approved,
        videoCount,
        miniPlayerEnabled: ctx.user.miniPlayerEnabled,
        miniPlayerPromptSeen: ctx.user.miniPlayerPromptSeen,
        notifySubscribersOnUpload: ctx.user.notifySubscribersOnUpload,
        subscriptionTier: ctx.user.subscriptionTier,
        subscriptionStatus: ctx.user.subscriptionStatus,
        subscriptionPeriodEnd: ctx.user.subscriptionPeriodEnd,
      };
    }),

    signUp: publicProcedure
      .use(
        rateLimit({ name: "signUp", keyBy: "ip", max: 3, windowMs: HOUR }),
      )
      .input(signUpInputSchema)
      .mutation(({ ctx, input }) => ctx.services.users.signUp(input)),

    confirmSignUp: publicProcedure
      .use(
        rateLimit({
          name: "confirmSignUp",
          keyBy: "ip",
          max: 10,
          windowMs: HOUR,
        }),
      )
      .input(confirmSignUpInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.confirmSignUp(input.token),
      ),

    resendConfirmation: publicProcedure
      .use(
        // 2 per 24 hours per IP. A user who's stuck can hit this once
        // and again later, but a script can't spam any address. Counts
        // both the in-dialog "resend" button on the upload form and the
        // signup-screen "still waiting" button — same upstream send.
        rateLimit({
          name: "resendConfirmation",
          keyBy: "ip",
          max: 2,
          windowMs: 24 * HOUR,
        }),
      )
      .input(resendConfirmationInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.resendConfirmation(input.email),
      ),

    signIn: publicProcedure
      .use(
        rateLimit({ name: "signIn", keyBy: "ip", max: 5, windowMs: MIN }),
      )
      .input(signInInputSchema)
      .mutation(async ({ ctx, input }) => {
        const user = await ctx.services.users.verifyPassword(input);
        if (!user) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        };
      }),
  }),

  videos: router({
    list: publicProcedure
      .input(listVideosInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.videos.list({
          ...input,
          viewerId: ctx.user?.id ?? null,
        }),
      ),

    search: publicProcedure
      .input(searchVideosInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.videos.search({
          ...input,
          viewerId: ctx.user?.id ?? null,
        }),
      ),

    byId: publicProcedure
      // Defense-in-depth rate limit applied to everyone, anon or not. 60/min
      // is generous for normal browsing (the page itself fires one byId
      // call per load) but kills any sustained scrape loop.
      .use(
        rateLimit({
          name: "videos.byId",
          keyBy: "ip",
          max: 60,
          windowMs: MIN,
        }),
      )
      .input(videoIdInputSchema)
      .query(({ ctx, input }) => {
        // Anonymous viewers get a daily distinct-target cap. Reloads of the
        // same video are free — only first-time-in-window views count.
        // Throws ANON_VIEW_LIMIT:video when the cap fires; the SSR page
        // detects the prefix and renders a sign-up CTA.
        if (!ctx.user) {
          try {
            const state = enforceAnonView(ctx.ip, "video", input.id);
            if (state.newId) {
              trafficLog.log(
                `videos.byId actor=anon ip=${ctx.ip} videoId=${input.id} anonViewCount=${state.count}/${state.limit}`,
              );
            }
          } catch (err) {
            trafficLog.warn(
              `videos.byId blocked=anon-view-limit ip=${ctx.ip} videoId=${input.id}`,
            );
            throw err;
          }
        } else {
          trafficLog.log(
            `videos.byId actor=user userId=${ctx.user.id} ip=${ctx.ip} videoId=${input.id}`,
          );
        }
        return ctx.services.videos.byId(input.id, ctx.user?.id ?? null);
      }),

    suggested: publicProcedure
      .input(videoIdInputSchema.extend({ limit: z.number().int().min(1).max(20).default(10) }))
      .query(({ ctx, input }) =>
        ctx.services.videos.suggested(
          input.id,
          input.limit,
          ctx.user?.id ?? null,
        ),
      ),

    sitemap: publicProcedure.query(({ ctx }) =>
      ctx.services.videos.listPublicForSitemap(),
    ),

    // Per-user listing for the /@username profile page.
    byOwner: publicProcedure
      .input(listByOwnerInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.videos.listByOwner({
          ownerId: input.ownerId,
          cursor: input.cursor,
          limit: input.limit,
          viewerId: ctx.user?.id ?? null,
        }),
      ),

    // Lifetime view counter +1. Public so anonymous viewers count too;
    // per-session dedupe lives on the client.
    incrementView: publicProcedure
      .use(
        rateLimit({
          name: "videos.incrementView",
          keyBy: "ip",
          max: 60,
          windowMs: MIN,
        }),
      )
      .input(videoIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.videos.incrementView(input.id),
      ),

    // Hover-card list of who liked / disliked. Public — anonymous
    // browsers see avatars and names too. Rate-limited generously
    // since the popover lazy-loads on every hover.
    reactors: publicProcedure
      .use(
        rateLimit({
          name: "videos.reactors",
          keyBy: "ip",
          max: 120,
          windowMs: MIN,
        }),
      )
      .input(videoReactorsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.reactions.listReactors({
          kind: "video",
          targetId: input.videoId,
          type: input.type,
          limit: input.limit,
        }),
      ),

    uploadQuota: protectedProcedure.query(({ ctx }) =>
      ctx.services.videos.getUploadQuota(ctx.user.id),
    ),

    createUpload: protectedProcedure
      .use(
        rateLimit({
          name: "videos.createUpload",
          keyBy: "userId",
          max: 20,
          windowMs: HOUR,
        }),
      )
      .input(createUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.videos.createUpload({
          ownerId: ctx.user.id,
          ownerStatus: ctx.user.status,
          // Admins always count as approved — the column may not have been
          // synced yet by syncRoleFromEnv on their first request.
          ownerApproved: ctx.user.role === "admin" || ctx.user.approved,
          title: input.title,
          description: input.description,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          tagNames: input.tags,
          visibility: input.visibility,
          downloadPolicy: input.downloadPolicy,
        }),
      ),

    finalizeUpload: verifiedProcedure
      .input(finalizeUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.videos.finalizeUpload({
          videoId: input.videoId,
          ownerId: ctx.user.id,
          compressServerSide: input.compressServerSide,
          thumbnailS3Key: input.thumbnailS3Key,
        }),
      ),

    // Delete is protected, not verified: a user who uploaded under the
    // unverified 1-of-each allowance must still be able to clean up their
    // own row. Ownership check inside the service is the real gate, with
    // admins bypassing it.
    delete: protectedProcedure
      .input(videoIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.videos.deleteVideo(
          input.id,
          ctx.user.id,
          ctx.user.role === "admin",
        ),
      ),

    react: verifiedProcedure
      .input(reactToVideoInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.reactions.setReaction(
          input.videoId,
          ctx.user.id,
          input.type,
        ),
      ),

    // Listing your own favorites stays on the lighter gate — it's read-only
    // and `favorites.toggle` already requires verified, so unverified users
    // can't add to it anyway.
    favorites: protectedProcedure
      .input(listFavoritesInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.videos.listFavorites({
          userId: ctx.user.id,
          cursor: input.cursor,
          limit: input.limit,
        }),
      ),
  }),

  favorites: router({
    toggle: verifiedProcedure
      .input(toggleFavoriteInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.favorites.toggle(input.videoId, ctx.user.id),
      ),
  }),

  gifs: router({
    list: publicProcedure
      .input(listGifsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.gifs.list({ ...input, viewerId: ctx.user?.id ?? null }),
      ),

    search: publicProcedure
      .input(searchGifsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.gifs.search({ ...input, viewerId: ctx.user?.id ?? null }),
      ),

    byId: publicProcedure
      .use(
        rateLimit({
          name: "gifs.byId",
          keyBy: "ip",
          max: 60,
          windowMs: MIN,
        }),
      )
      .input(gifIdInputSchema)
      .query(({ ctx, input }) => {
        if (!ctx.user) {
          try {
            const state = enforceAnonView(ctx.ip, "gif", input.id);
            if (state.newId) {
              trafficLog.log(
                `gifs.byId actor=anon ip=${ctx.ip} gifId=${input.id} anonViewCount=${state.count}/${state.limit}`,
              );
            }
          } catch (err) {
            trafficLog.warn(
              `gifs.byId blocked=anon-view-limit ip=${ctx.ip} gifId=${input.id}`,
            );
            throw err;
          }
        } else {
          trafficLog.log(
            `gifs.byId actor=user userId=${ctx.user.id} ip=${ctx.ip} gifId=${input.id}`,
          );
        }
        return ctx.services.gifs.byId(input.id, ctx.user?.id ?? null);
      }),

    suggested: publicProcedure
      .input(
        gifIdInputSchema.extend({
          limit: z.number().int().min(1).max(20).default(10),
        }),
      )
      .query(({ ctx, input }) =>
        ctx.services.gifs.suggested(
          input.id,
          input.limit,
          ctx.user?.id ?? null,
        ),
      ),

    createUpload: protectedProcedure
      .use(
        rateLimit({
          name: "gifs.createUpload",
          keyBy: "userId",
          max: 20,
          windowMs: HOUR,
        }),
      )
      .input(createGifUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.gifs.createUpload({
          ownerId: ctx.user.id,
          ownerStatus: ctx.user.status,
          // Admins always count as approved — the column may not have been
          // synced yet by syncRoleFromEnv on their first request.
          ownerApproved: ctx.user.role === "admin" || ctx.user.approved,
          title: input.title,
          description: input.description,
          sizeBytes: input.sizeBytes,
          durationSeconds: input.durationSeconds,
          tagNames: input.tags,
          visibility: input.visibility,
        }),
      ),

    finalizeUpload: verifiedProcedure
      .input(finalizeGifUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.gifs.finalizeUpload({
          gifId: input.gifId,
          ownerId: ctx.user.id,
        }),
      ),

    delete: protectedProcedure
      .input(gifIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.gifs.deleteGif(
          input.id,
          ctx.user.id,
          ctx.user.role === "admin",
        ),
      ),

    react: verifiedProcedure
      .input(reactToGifInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.reactions.setGifReaction(
          input.gifId,
          ctx.user.id,
          input.type,
        ),
      ),

    sitemap: publicProcedure.query(({ ctx }) =>
      ctx.services.gifs.listPublicForSitemap(),
    ),

    byOwner: publicProcedure
      .input(listByOwnerInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.gifs.listByOwner({
          ownerId: input.ownerId,
          cursor: input.cursor,
          limit: input.limit,
          viewerId: ctx.user?.id ?? null,
        }),
      ),

    incrementView: publicProcedure
      .use(
        rateLimit({
          name: "gifs.incrementView",
          keyBy: "ip",
          max: 60,
          windowMs: MIN,
        }),
      )
      .input(gifIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.gifs.incrementView(input.id),
      ),

    reactors: publicProcedure
      .use(
        rateLimit({
          name: "gifs.reactors",
          keyBy: "ip",
          max: 120,
          windowMs: MIN,
        }),
      )
      .input(gifReactorsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.reactions.listReactors({
          kind: "gif",
          targetId: input.gifId,
          type: input.type,
          limit: input.limit,
        }),
      ),
  }),

  screenshots: router({
    list: publicProcedure
      .input(listScreenshotsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.screenshots.list({
          cursor: input.cursor,
          limit: input.limit,
          ownerId: input.ownerId,
          viewerId: ctx.user?.id ?? null,
        }),
      ),

    byId: publicProcedure
      .input(screenshotIdInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.screenshots.byId(input.id, ctx.user?.id ?? null),
      ),

    createUpload: protectedProcedure
      .use(
        rateLimit({
          name: "screenshots.createUpload",
          keyBy: "userId",
          max: 20,
          windowMs: HOUR,
        }),
      )
      .input(createScreenshotUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.screenshots.createUpload({
          ownerId: ctx.user.id,
          ownerStatus: ctx.user.status,
          // Admins always count as approved — the column may not have been
          // synced yet by syncRoleFromEnv on their first request.
          ownerApproved: ctx.user.role === "admin" || ctx.user.approved,
          title: input.title,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          width: input.width,
          height: input.height,
          visibility: input.visibility,
          source: input.source,
        }),
      ),

    finalizeUpload: verifiedProcedure
      .input(finalizeScreenshotUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.screenshots.finalizeUpload({
          screenshotId: input.screenshotId,
          ownerId: ctx.user.id,
        }),
      ),

    delete: protectedProcedure
      .input(screenshotIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.screenshots.deleteScreenshot(
          input.id,
          ctx.user.id,
          ctx.user.role === "admin",
        ),
      ),

    sitemap: publicProcedure.query(({ ctx }) =>
      ctx.services.screenshots.listPublicForSitemap(),
    ),

    incrementView: publicProcedure
      .use(
        rateLimit({
          name: "screenshots.incrementView",
          keyBy: "ip",
          max: 60,
          windowMs: MIN,
        }),
      )
      .input(screenshotIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.screenshots.incrementView(input.id),
      ),
  }),

  comments: router({
    listByVideo: publicProcedure
      .input(listCommentsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.comments.listByVideo(
          input.id,
          ctx.user?.id ?? null,
          input.sort,
        ),
      ),

    listByGif: publicProcedure
      .input(listGifCommentsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.comments.listByGif(
          input.id,
          ctx.user?.id ?? null,
          input.sort,
        ),
      ),

    createOnGif: verifiedProcedure
      .input(createGifCommentInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.comments.createOnGif(
          input.gifId,
          ctx.user.id,
          input.body,
          input.parentId ?? null,
        ),
      ),

    react: verifiedProcedure
      .input(reactToCommentInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.reactions.setCommentReaction(
          input.commentId,
          ctx.user.id,
          input.type,
        ),
      ),

    create: verifiedProcedure
      .input(createCommentInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.comments.create(
          input.videoId,
          ctx.user.id,
          input.body,
          input.parentId ?? null,
        ),
      ),

    update: verifiedProcedure
      .input(updateCommentInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.comments.update(input.id, ctx.user.id, input.body),
      ),

    delete: verifiedProcedure
      .input(commentIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.comments.delete(input.id, ctx.user.id),
      ),
  }),

  tags: router({
    search: publicProcedure
      .input(tagSearchInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.tags.search(input.q, input.limit),
      ),
  }),

  notifications: router({
    list: protectedProcedure
      .input(listNotificationsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.notifications.list(
          ctx.user.id,
          input.cursor,
          input.limit,
        ),
      ),

    unreadCount: protectedProcedure.query(({ ctx }) =>
      ctx.services.notifications.unreadCount(ctx.user.id),
    ),

    markRead: protectedProcedure
      .input(notificationIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.notifications.markRead(input.id, ctx.user.id),
      ),

    markAllRead: protectedProcedure.mutation(({ ctx }) =>
      ctx.services.notifications.markAllRead(ctx.user.id),
    ),
  }),

  users: router({
    createAvatarUpload: protectedProcedure
      .input(createAvatarUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.startAvatarUpload(ctx.user.id, input.mimeType),
      ),

    finalizeAvatarUpload: protectedProcedure
      .input(finalizeAvatarUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.finalizeAvatarUpload(ctx.user.id, input.s3Key),
      ),

    setMiniPlayerPreference: protectedProcedure
      .input(setMiniPlayerPreferenceInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.setMiniPlayerPreference(ctx.user.id, input.enabled),
      ),

    setNotifySubscribersOnUpload: protectedProcedure
      .input(setNotifySubscribersOnUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.setNotifySubscribersOnUpload(
          ctx.user.id,
          input.enabled,
        ),
      ),

    deleteSelf: protectedProcedure.mutation(({ ctx }) =>
      ctx.services.users.deleteSelf(ctx.user.id),
    ),

    // Public profile lookup by URL slug (the @-handle). Returns null
    // when the user doesn't exist so the page can render notFound()
    // without surfacing a tRPC error to the client.
    profile: publicProcedure
      .input(usernameInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.users.getProfile({
          username: input.username,
          viewerId: ctx.user?.id ?? null,
        }),
      ),
  }),

  admin: router({
    listUsers: adminProcedure
      .input(adminListUsersInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.users.adminListUsers({
          cursor: input.cursor,
          limit: input.limit,
          q: input.q,
        }),
      ),

    deleteUser: adminProcedure
      .input(userIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.adminDeleteUser({
          actingUserId: ctx.user.id,
          targetUserId: input.userId,
        }),
      ),

    unverifyUser: adminProcedure
      .input(userIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.adminUnverifyUser({
          actingUserId: ctx.user.id,
          targetUserId: input.userId,
        }),
      ),

    verifyUser: adminProcedure
      .input(userIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.adminVerifyUser({
          actingUserId: ctx.user.id,
          targetUserId: input.userId,
        }),
      ),

    approveUser: adminProcedure
      .input(userIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.adminApproveUser({
          actingUserId: ctx.user.id,
          targetUserId: input.userId,
        }),
      ),

    unapproveUser: adminProcedure
      .input(userIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.adminUnapproveUser({
          actingUserId: ctx.user.id,
          targetUserId: input.userId,
        }),
      ),
  }),

  billing: router({
    me: protectedProcedure.query(({ ctx }) => ({
      tier: ctx.user.subscriptionTier,
      status: ctx.user.subscriptionStatus,
      periodEnd: ctx.user.subscriptionPeriodEnd,
      hasSubscription: !!ctx.user.lemonSubscriptionId,
    })),

    createCheckoutSession: protectedProcedure
      .input(billingCheckoutInputSchema)
      .mutation(({ ctx, input }) => {
        const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
        return ctx.services.billing.createCheckoutSession({
          userId: ctx.user.id,
          successUrl: `${origin}${input.successPath}?checkout=success`,
        });
      }),

    // LemonSqueezy scopes the "manage subscription" portal per-subscription
    // and the URL is short-lived, so we fetch a fresh one on every click.
    getPortalUrl: protectedProcedure.mutation(({ ctx }) =>
      ctx.services.billing.getPortalUrl({ userId: ctx.user.id }),
    ),
  }),

  subscriptions: router({
    toggle: verifiedProcedure
      .input(userIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const result = await ctx.services.subscriptions.toggle(
          ctx.user.id,
          input.userId,
        );
        // Fire side-effects after the toggle resolves so the user gets a
        // fast response; pushes/notifications are best-effort and don't
        // affect the toggle outcome.
        if (result.subscribed) {
          await ctx.services.notifications.onSubscribed(
            ctx.user.id,
            input.userId,
          );
        } else {
          await ctx.services.notifications.onUnsubscribed(
            ctx.user.id,
            input.userId,
          );
        }
        return result;
      }),

    isSubscribed: publicProcedure
      .input(userIdInputSchema)
      .query(({ ctx, input }) =>
        ctx.user
          ? ctx.services.subscriptions.isSubscribed(ctx.user.id, input.userId)
          : Promise.resolve(false),
      ),

    followerCount: publicProcedure
      .input(userIdInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.subscriptions.followerCount(input.userId),
      ),

    // Users you subscribe to. Defaults to the signed-in user when no userId
    // is supplied, so the /subscriptions page can call without args.
    following: protectedProcedure
      .input(listSubscriptionsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.subscriptions.listFollowing(
          input.userId ?? ctx.user.id,
          input.cursor,
          input.limit,
        ),
      ),

    // Users who subscribe to you (or to a given userId).
    followers: protectedProcedure
      .input(listSubscriptionsInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.subscriptions.listFollowers(
          input.userId ?? ctx.user.id,
          input.cursor,
          input.limit,
        ),
      ),
  }),

  audio: router({
    // The signed-in user's library of audio templates.
    listMine: protectedProcedure.query(({ ctx }) =>
      ctx.services.audio.listMine(ctx.user.id),
    ),

    createUpload: verifiedProcedure
      .input(createAudioUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.audio.createUpload({
          ownerId: ctx.user.id,
          title: input.title,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          durationSeconds: input.durationSeconds,
        }),
      ),

    finalizeUpload: verifiedProcedure
      .input(finalizeAudioUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.audio.finalizeUpload({
          ownerId: ctx.user.id,
          audioTemplateId: input.audioTemplateId,
        }),
      ),

    delete: verifiedProcedure
      .input(audioTemplateIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.audio.deleteTemplate(input.id, ctx.user.id),
      ),

    // Attach an existing template as an overlay on one of your videos.
    attach: verifiedProcedure
      .input(attachAudioInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.audio.attachToVideo({
          ownerId: ctx.user.id,
          videoId: input.videoId,
          audioTemplateId: input.audioTemplateId,
          startSeconds: input.startSeconds,
          volume: input.volume,
        }),
      ),

    update: verifiedProcedure
      .input(updateAudioTrackInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.audio.updateAttachment({
          ownerId: ctx.user.id,
          trackId: input.trackId,
          startSeconds: input.startSeconds,
          volume: input.volume,
        }),
      ),

    detach: verifiedProcedure
      .input(audioTrackIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.audio.detach(input.trackId, ctx.user.id),
      ),

    setMainMuted: verifiedProcedure
      .input(setMainAudioMutedInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.audio.setMainMuted(
          input.videoId,
          ctx.user.id,
          input.muted,
        ),
      ),
  }),

  // ─── Web Push subscriptions ───
  // Public key is fetched anonymously (the SW asks for it before showing
  // the permission prompt); subscribe/unsubscribe require auth so we tie
  // the endpoint to the right user.
  push: router({
    publicKey: publicProcedure.query(({ ctx }) => ({
      key: ctx.services.push.getPublicKey(),
      enabled: ctx.services.push.isEnabled(),
    })),

    subscribe: protectedProcedure
      .input(pushSubscribeInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.push
          .upsert({
            userId: ctx.user.id,
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
            userAgent: input.userAgent ?? null,
          })
          .then(() => ({ ok: true as const })),
      ),

    unsubscribe: protectedProcedure
      .input(pushUnsubscribeInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.push
          .removeByEndpoint(input.endpoint)
          .then(() => ({ ok: true as const })),
      ),
  }),
});

export type AppRouter = typeof appRouter;
