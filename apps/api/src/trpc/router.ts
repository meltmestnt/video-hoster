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
  signInInputSchema,
  signUpInputSchema,
  tagSearchInputSchema,
  toggleFavoriteInputSchema,
  updateCommentInputSchema,
  videoIdInputSchema,
} from "@repo/shared";
import {
  router,
  publicProcedure,
  protectedProcedure,
  verifiedProcedure,
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
        videoCount,
        miniPlayerEnabled: ctx.user.miniPlayerEnabled,
        miniPlayerPromptSeen: ctx.user.miniPlayerPromptSeen,
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

    delete: protectedProcedure
      .input(videoIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.videos.deleteVideo(input.id, ctx.user.id),
      ),

    react: protectedProcedure
      .input(reactToVideoInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.reactions.setReaction(
          input.videoId,
          ctx.user.id,
          input.type,
        ),
      ),

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
    toggle: protectedProcedure
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

    delete: protectedProcedure
      .input(gifIdInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.gifs.deleteGif(input.id, ctx.user.id),
      ),

    react: protectedProcedure
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

    createOnGif: protectedProcedure
      .input(createGifCommentInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.comments.createOnGif(
          input.gifId,
          ctx.user.id,
          input.body,
          input.parentId ?? null,
        ),
      ),

    react: protectedProcedure
      .input(reactToCommentInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.reactions.setCommentReaction(
          input.commentId,
          ctx.user.id,
          input.type,
        ),
      ),

    create: protectedProcedure
      .input(createCommentInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.comments.create(
          input.videoId,
          ctx.user.id,
          input.body,
          input.parentId ?? null,
        ),
      ),

    update: protectedProcedure
      .input(updateCommentInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.services.comments.update(input.id, ctx.user.id, input.body),
      ),

    delete: protectedProcedure
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
  }),
});

export type AppRouter = typeof appRouter;
