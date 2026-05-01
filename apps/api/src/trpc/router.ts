import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  commentIdInputSchema,
  confirmSignUpInputSchema,
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
} from "@repo/shared";
import {
  router,
  publicProcedure,
  protectedProcedure,
  verifiedProcedure,
  adminProcedure,
} from "./trpc";

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
        avatarUrl,
        status: ctx.user.status,
        role: ctx.user.role,
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
      .input(signUpInputSchema)
      .mutation(({ ctx, input }) => ctx.services.users.signUp(input)),

    confirmSignUp: publicProcedure
      .input(confirmSignUpInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.users.confirmSignUp(input.token),
      ),

    signIn: publicProcedure
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
      .input(videoIdInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.videos.byId(input.id, ctx.user?.id ?? null),
      ),

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

    uploadQuota: protectedProcedure.query(({ ctx }) =>
      ctx.services.videos.getUploadQuota(ctx.user.id),
    ),

    createUpload: verifiedProcedure
      .input(createUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.videos.createUpload({
          ownerId: ctx.user.id,
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

    delete: verifiedProcedure
      .input(videoIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.videos.deleteVideo(input.id, ctx.user.id),
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
      .input(gifIdInputSchema)
      .query(({ ctx, input }) =>
        ctx.services.gifs.byId(input.id, ctx.user?.id ?? null),
      ),

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

    createUpload: verifiedProcedure
      .input(createGifUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.gifs.createUpload({
          ownerId: ctx.user.id,
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

    delete: verifiedProcedure
      .input(gifIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.gifs.deleteGif(input.id, ctx.user.id),
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

    createUpload: verifiedProcedure
      .input(createScreenshotUploadInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.screenshots.createUpload({
          ownerId: ctx.user.id,
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

    delete: verifiedProcedure
      .input(screenshotIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.screenshots.deleteScreenshot(input.id, ctx.user.id),
      ),

    sitemap: publicProcedure.query(({ ctx }) =>
      ctx.services.screenshots.listPublicForSitemap(),
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
      .mutation(({ ctx, input }) =>
        ctx.services.subscriptions.toggle(ctx.user.id, input.userId),
      ),

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
});

export type AppRouter = typeof appRouter;
