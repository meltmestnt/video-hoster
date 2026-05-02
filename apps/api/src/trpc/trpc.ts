import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const verifiedProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.status !== "verified") {
    // Generic — this gate sits in front of uploads, comments, reactions,
    // Telegram link, and more, so any per-feature wording (e.g. "before
    // uploading videos") is wrong for at least one caller. Keep it
    // action-agnostic so the message reads correctly wherever it surfaces.
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Please confirm your email to continue.",
    });
  }
  return next({ ctx });
});
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx });
});

/**
 * Gates a route behind an active Pro subscription. Admins bypass — they get
 * implicit access to everything. Use this for any feature you want to keep
 * paid; the client-side `<RequiresPro>` is just UX, this is the real gate.
 */
export const proProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === "admin") return next({ ctx });
  if (ctx.user.subscriptionTier !== "pro") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This feature requires a Pro subscription",
    });
  }
  return next({ ctx });
});
