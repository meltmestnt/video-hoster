import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, LessThan, Or, Repository } from "typeorm";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_BYTES,
  type AllowedAvatarMimeType,
} from "@repo/shared";
import { User } from "./user.entity";
import { MailService } from "../mail/mail.service";
import { S3Service } from "../s3/s3.service";
import { MediaService } from "../media/media.service";

const AVATAR_EXT_BY_MIME: Record<AllowedAvatarMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface AuthPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string | null;
}

const BCRYPT_ROUNDS = 12;
const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000;

export type SignUpResult =
  | { status: "pending"; email: string; mailSent: boolean }
  | {
      status: "confirmed";
      id: string;
      email: string;
      name: string;
    };

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  // In-memory throttle for the lastSeenAt write. Without this, every
  // tRPC call from a chatty SPA (the dashboard polls notifications,
  // the bell polls counts, etc.) would issue a DB UPDATE — fine
  // correctness-wise, wasteful in practice. We only persist a bump
  // when the previous one is older than this window.
  private readonly lastSeenBumps = new Map<string, number>();
  private static readonly LAST_SEEN_THROTTLE_MS = 30 * 1000;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly s3: S3Service,
    private readonly media: MediaService,
  ) {}

  /**
   * One-shot backfill on app startup. ensureUsername is idempotent and
   * only writes the column when it's currently NULL, so this is a safe
   * no-op once everyone has a slug. Logs the count so a deploy that
   * adds the column for the first time leaves a paper trail. Without
   * this, owner.username stays null for any user who hasn't re-auth'd
   * since the column was added — and every video/gif/screenshot in their
   * collection renders a non-clickable name.
   */
  async onModuleInit() {
    try {
      const orphans = await this.users.find({
        where: { username: IsNull() },
        select: ["id", "name", "email"],
        take: 5000,
      });
      if (orphans.length === 0) return;
      this.logger.log(
        `users.backfillUsernames found ${orphans.length} users without a username — backfilling`,
      );
      let ok = 0;
      for (const partial of orphans) {
        const full = await this.users.findOne({ where: { id: partial.id } });
        if (!full) continue;
        try {
          await this.ensureUsername(full);
          ok++;
        } catch (err) {
          this.logger.warn(
            `users.backfillUsernames failed for ${partial.id}: ${(err as Error).message}`,
          );
        }
      }
      this.logger.log(
        `users.backfillUsernames done filled=${ok}/${orphans.length}`,
      );
    } catch (err) {
      // Backfill is best-effort. A DB error here shouldn't keep the
      // module from booting — every login path also calls ensureUsername
      // lazily, so the column will fill in over time even if startup
      // backfill fails.
      this.logger.warn(
        `users.backfillUsernames failed: ${(err as Error).message}`,
      );
    }
  }

  async resolveAvatarUrl(user: User): Promise<string | null> {
    if (user.avatarS3Key) {
      return this.media.signUrl({ kind: "avatar", id: user.id });
    }
    return user.avatarUrl ?? null;
  }

  async startAvatarUpload(
    userId: string,
    mimeType: AllowedAvatarMimeType,
  ): Promise<{ s3Key: string; uploadUrl: string }> {
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException("Unsupported avatar image type");
    }
    const ext = AVATAR_EXT_BY_MIME[mimeType];
    const token = randomBytes(8).toString("hex");
    const s3Key = `avatars/${userId}/${Date.now()}-${token}.${ext}`;
    const uploadUrl = await this.s3.presignPut(s3Key, mimeType);
    return { s3Key, uploadUrl };
  }

  async setMiniPlayerPreference(
    userId: string,
    enabled: boolean,
  ): Promise<{ miniPlayerEnabled: boolean; miniPlayerPromptSeen: boolean }> {
    // Use update() rather than findOne+mutate+save() — `passwordHash` has
    // `select: false`, and TypeORM's save() can re-emit the row including
    // null for unselected columns depending on driver/version.
    const result = await this.users.update(
      { id: userId },
      { miniPlayerEnabled: enabled, miniPlayerPromptSeen: true },
    );
    if (!result.affected) throw new NotFoundException("User not found");
    // Surface in Railway logs so a "switch reverts on reload" report
    // can be confirmed against the actual DB write.
    this.logger.log(
      `users.setMiniPlayerPreference userId=${userId} enabled=${enabled}`,
    );
    return { miniPlayerEnabled: enabled, miniPlayerPromptSeen: true };
  }

  async setNotifySubscribersOnUpload(
    userId: string,
    enabled: boolean,
  ): Promise<{ notifySubscribersOnUpload: boolean }> {
    const result = await this.users.update(
      { id: userId },
      { notifySubscribersOnUpload: enabled },
    );
    if (!result.affected) throw new NotFoundException("User not found");
    return { notifySubscribersOnUpload: enabled };
  }

  async finalizeAvatarUpload(
    userId: string,
    s3Key: string,
  ): Promise<{ avatarUrl: string }> {
    const expectedPrefix = `avatars/${userId}/`;
    if (!s3Key.startsWith(expectedPrefix)) {
      throw new BadRequestException("Avatar key does not belong to this user");
    }
    const head = await this.s3.headObject(s3Key);
    if (!head) {
      throw new BadRequestException("Avatar object not found in S3");
    }
    // Server-side enforce the size cap. The presigned PUT itself doesn't
    // constrain bytes, so a client can declare 1 KB and upload 1 GB —
    // delete the offending object before it sticks around in S3.
    if (head.size > MAX_AVATAR_BYTES) {
      await this.s3.deleteObject(s3Key).catch(() => {});
      throw new BadRequestException(
        `Avatar exceeds ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB limit`,
      );
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const previousKey = user.avatarS3Key;
    await this.users.update({ id: userId }, { avatarS3Key: s3Key });

    if (previousKey && previousKey !== s3Key) {
      this.s3.deleteObject(previousKey).catch((err) => {
        this.logger.warn(
          `Failed to delete previous avatar ${previousKey}: ${(err as Error).message}`,
        );
      });
    }

    const avatarUrl =
      (await this.media.signUrl({ kind: "avatar", id: userId })) ?? "";
    return { avatarUrl };
  }

  async upsertFromAuthPayload(payload: AuthPayload): Promise<User> {
    const existing = await this.users.findOne({
      where: { googleId: payload.sub },
    });
    if (existing) {
      let dirty = false;
      if (existing.email !== payload.email) {
        existing.email = payload.email;
        dirty = true;
      }
      if (existing.name !== payload.name) {
        existing.name = payload.name;
        dirty = true;
      }
      const nextAvatar = payload.picture ?? null;
      if (existing.avatarUrl !== nextAvatar) {
        existing.avatarUrl = nextAvatar;
        dirty = true;
      }
      if (dirty) await this.users.save(existing);
      // Lazy-fill the URL slug for users who signed up before the column
      // existed. Idempotent — no-op if already set.
      await this.ensureUsername(existing);
      await this.syncRoleFromEnv(existing);
      return existing;
    }

    const emailTaken = await this.users.findOne({
      where: { email: payload.email },
    });
    if (emailTaken) {
      // Generic message — don't leak that the email is registered with
      // credentials. The legitimate path here is the user signing in via
      // their original method; an attacker probing accounts gets nothing.
      throw new ConflictException(
        "Could not link this Google account. Please sign in with your existing method.",
      );
    }

    const created = this.users.create({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture ?? null,
      passwordHash: null,
      status: "verified",
    });
    try {
      const saved = await this.users.save(created);
      await this.ensureUsername(saved);
      await this.syncRoleFromEnv(saved);
      return saved;
    } catch (err) {
      // Race: a concurrent OAuth callback for the same user just inserted.
      // The unique index on email/googleId throws a 23505 unique_violation;
      // re-fetch and return the winner so both callers see a stable user.
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        const winner = await this.users.findOne({
          where: { googleId: payload.sub },
        });
        if (winner) {
          await this.ensureUsername(winner);
          return winner;
        }
      }
      throw err;
    }
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.users.findOne({ where: { id } });
    if (user) {
      await this.syncRoleFromEnv(user);
      await this.ensureUsername(user);
    }
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.users.findOne({ where: { username: username.toLowerCase() } });
  }

  /**
   * Update the user's `lastSeenAt` so the admin manage page can show a
   * presence dot. Writes are throttled per-user via an in-memory map so
   * a chatty SPA only hits the DB once every LAST_SEEN_THROTTLE_MS.
   * Best-effort: errors are logged and swallowed — last-seen drift
   * shouldn't break the request that triggered it.
   */
  bumpLastSeen(userId: string): void {
    const now = Date.now();
    const last = this.lastSeenBumps.get(userId) ?? 0;
    if (now - last < UsersService.LAST_SEEN_THROTTLE_MS) return;
    this.lastSeenBumps.set(userId, now);
    // Fire-and-forget — the caller is hot-path tRPC context resolution.
    void this.users
      .update({ id: userId }, { lastSeenAt: new Date(now) })
      .catch((err) =>
        this.logger.warn(
          `users.bumpLastSeen failed userId=${userId}: ${(err as Error).message}`,
        ),
      );
  }

  /**
   * Public profile DTO. Throws 404 when the username doesn't resolve so
   * the page-level error boundary can render notFound() cleanly. The
   * counts are filtered to public-only when the viewer isn't the owner.
   */
  async getProfile(args: {
    username: string;
    viewerId: string | null;
    viewerIsAdmin?: boolean;
  }): Promise<{
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    role: User["role"];
    createdAt: Date;
    counts: {
      videos: number;
      gifs: number;
      // How many of `gifs` came in through the Telegram bot. Always
      // included (zero means the user hasn't used the bot). Subset of
      // the `gifs` count above; UI shows it as a separate stat row.
      gifsViaTelegram: number;
      screenshots: number;
    };
    followerCount: number;
  }> {
    const user = await this.findByUsername(args.username);
    if (!user) throw new NotFoundException("Profile not found");

    const isSelf = args.viewerId === user.id;
    // Public counts only when viewing someone else's page; the owner
    // sees their full count including private uploads, and so do admins
    // (they can moderate private items, so the count should match what
    // they're actually about to see in the listings below).
    const visibilityFilter =
      isSelf || args.viewerIsAdmin ? "" : `AND visibility = 'public'`;

    const [
      videoCount,
      gifCount,
      gifsViaTelegram,
      screenshotCount,
      followerCount,
    ] = await Promise.all([
      this.users.manager
        .query<Array<{ count: string }>>(
          `SELECT COUNT(*) FROM videos
             WHERE "ownerId" = $1 AND status = 'ready' ${visibilityFilter}`,
          [user.id],
        )
        .then((rows) => Number(rows[0]?.count ?? 0)),
      this.users.manager
        .query<Array<{ count: string }>>(
          `SELECT COUNT(*) FROM gifs
             WHERE "ownerId" = $1 AND status = 'ready' ${visibilityFilter}`,
          [user.id],
        )
        .then((rows) => Number(rows[0]?.count ?? 0)),
      this.users.manager
        .query<Array<{ count: string }>>(
          `SELECT COUNT(*) FROM gifs
             WHERE "ownerId" = $1 AND status = 'ready' AND source = 'telegram' ${visibilityFilter}`,
          [user.id],
        )
        .then((rows) => Number(rows[0]?.count ?? 0)),
      this.users.manager
        .query<Array<{ count: string }>>(
          `SELECT COUNT(*) FROM screenshots
             WHERE "ownerId" = $1 AND status = 'ready' ${visibilityFilter}`,
          [user.id],
        )
        .then((rows) => Number(rows[0]?.count ?? 0)),
      this.users.manager
        .query<Array<{ count: string }>>(
          `SELECT COUNT(*) FROM subscriptions WHERE "targetUserId" = $1`,
          [user.id],
        )
        .then((rows) => Number(rows[0]?.count ?? 0)),
    ]);

    const avatarUrl = await this.resolveAvatarUrl(user);
    return {
      id: user.id,
      name: user.name,
      // Lazy-fill if the row predates the column.
      username: user.username ?? "",
      avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
      counts: {
        videos: videoCount,
        gifs: gifCount,
        gifsViaTelegram,
        screenshots: screenshotCount,
      },
      followerCount,
    };
  }

  /**
   * Generate a URL-safe handle for users that don't have one yet. Existing
   * rows from before the column was added are NULL — this fills them in
   * lazily on the first request that touches the user, so we never block
   * sign-in on a backfill.
   *
   * Strategy: lowercase ascii from `name`, fall back to email local-part
   * when the name has no Latin chars (Cyrillic-only names hash to empty),
   * trim/clamp, then suffix `-2`, `-3`, … on collision.
   */
  async ensureUsername(user: User): Promise<void> {
    if (user.username) return;
    const base = buildUsernameBase(user.name, user.email);
    let candidate = base;
    let suffix = 1;
    // 50 attempts is more than enough — past that the seed is degenerate.
    while (suffix < 50) {
      const taken = await this.users.findOne({
        where: { username: candidate },
        select: { id: true },
      });
      if (!taken || taken.id === user.id) break;
      suffix += 1;
      // Trim base if necessary so base + suffix stays under 32 chars.
      const numStr = String(suffix);
      const trimmed = base.slice(0, 32 - 1 - numStr.length);
      candidate = `${trimmed}-${numStr}`;
    }
    await this.users.update({ id: user.id }, { username: candidate });
    user.username = candidate;
  }

  /**
   * Bootstrap admins from the ADMIN_EMAILS env var (comma-separated). Runs on
   * every user load so promoting/demoting is just an env change + relogin —
   * no DB editing required. Persists the change once so subsequent loads are
   * a no-op when the env list hasn't changed.
   */
  private async syncRoleFromEnv(user: User): Promise<void> {
    const raw = this.config.get<string>("ADMIN_EMAILS")?.trim() ?? "";
    // Fail closed: if ADMIN_EMAILS is unset (e.g. a redeploy missed it) we
    // skip the sync entirely instead of silently demoting every existing
    // admin. Only an explicit non-empty list reshapes role state.
    if (!raw) return;
    const admins = new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    if (admins.size === 0) return;
    const shouldBeAdmin = admins.has(user.email.toLowerCase());
    const target: User["role"] = shouldBeAdmin ? "admin" : "user";
    const updates: Partial<User> = {};
    if (user.role !== target) updates.role = target;
    // Admins are implicitly approved — they shouldn't have to approve
    // themselves on first sign-in just because the column defaults to false.
    if (shouldBeAdmin && !user.approved) updates.approved = true;
    if (Object.keys(updates).length > 0) {
      Object.assign(user, updates);
      await this.users.update({ id: user.id }, updates);
    }
  }

  async adminListUsers(args: {
    cursor?: string;
    limit: number;
    q?: string;
  }): Promise<{
    items: Array<
      Pick<
        User,
        | "id"
        | "email"
        | "name"
        | "status"
        | "role"
        | "approved"
        | "avatarUrl"
        | "createdAt"
        | "lastSeenAt"
      > & { online: boolean }
    >;
    nextCursor: string | null;
  }> {
    const qb = this.users
      .createQueryBuilder("u")
      .orderBy("u.createdAt", "DESC")
      .addOrderBy("u.id", "DESC")
      .take(args.limit + 1);

    if (args.q && args.q.length > 0) {
      const like = `%${args.q.toLowerCase()}%`;
      qb.where(
        "(LOWER(u.email) LIKE :q OR LOWER(u.name) LIKE :q)",
        { q: like },
      );
    }

    if (args.cursor) {
      const c = await this.users.findOne({ where: { id: args.cursor } });
      if (c) qb.andWhere("u.createdAt < :cAt", { cAt: c.createdAt });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;
    // 5-minute presence window — long enough that a user reading a page
    // for several minutes still reads as online, short enough that a
    // closed tab clears within a coffee break.
    const onlineCutoff = Date.now() - 5 * 60 * 1000;
    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status,
        role: u.role,
        approved: u.approved,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt,
        online: !!u.lastSeenAt && u.lastSeenAt.getTime() >= onlineCutoff,
      })),
      nextCursor,
    };
  }

  async adminUnverifyUser(args: {
    actingUserId: string;
    targetUserId: string;
  }): Promise<{ ok: true }> {
    if (args.actingUserId === args.targetUserId) {
      throw new BadRequestException("You cannot unverify your own account");
    }
    const target = await this.users.findOne({
      where: { id: args.targetUserId },
    });
    if (!target) throw new NotFoundException("User not found");
    if (target.role === "admin") {
      throw new ForbiddenException("Cannot unverify another admin");
    }
    await this.users.update({ id: target.id }, { status: "unverified" });
    this.logger.log(
      `[ADMIN] users.adminUnverifyUser actor=admin actorId=${args.actingUserId} targetUserId=${target.id}`,
    );
    return { ok: true };
  }

  async adminVerifyUser(args: {
    actingUserId: string;
    targetUserId: string;
  }): Promise<{ ok: true }> {
    const target = await this.users.findOne({
      where: { id: args.targetUserId },
    });
    if (!target) throw new NotFoundException("User not found");
    // Manual approval supersedes the email confirmation — clear the token
    // so a stale one can't accidentally re-trigger anything later.
    await this.users.update(
      { id: target.id },
      {
        status: "verified",
        confirmationTokenHash: null,
        confirmationTokenExpiresAt: null,
      },
    );
    this.logger.log(
      `[ADMIN] users.adminVerifyUser actor=admin actorId=${args.actingUserId} targetUserId=${target.id} email=${target.email}`,
    );
    return { ok: true };
  }

  async adminApproveUser(args: {
    actingUserId: string;
    targetUserId: string;
  }): Promise<{ ok: true }> {
    const target = await this.users.findOne({
      where: { id: args.targetUserId },
    });
    if (!target) throw new NotFoundException("User not found");
    await this.users.update({ id: target.id }, { approved: true });
    this.logger.log(
      `[ADMIN] users.adminApproveUser actor=admin actorId=${args.actingUserId} targetUserId=${target.id}`,
    );
    return { ok: true };
  }

  async adminUnapproveUser(args: {
    actingUserId: string;
    targetUserId: string;
  }): Promise<{ ok: true }> {
    if (args.actingUserId === args.targetUserId) {
      throw new BadRequestException("You cannot unapprove your own account");
    }
    const target = await this.users.findOne({
      where: { id: args.targetUserId },
    });
    if (!target) throw new NotFoundException("User not found");
    if (target.role === "admin") {
      throw new ForbiddenException("Cannot unapprove another admin");
    }
    await this.users.update({ id: target.id }, { approved: false });
    this.logger.log(
      `[ADMIN] users.adminUnapproveUser actor=admin actorId=${args.actingUserId} targetUserId=${target.id}`,
    );
    return { ok: true };
  }

  async deleteSelf(userId: string): Promise<{ ok: true }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    const counts = await this.purgeUser(user);
    this.logger.log(
      `users.deleteSelf ok userId=${userId} s3Keys=${counts.s3Keys}`,
    );
    return { ok: true };
  }

  async adminDeleteUser(args: {
    actingUserId: string;
    targetUserId: string;
  }): Promise<{ ok: true }> {
    if (args.actingUserId === args.targetUserId) {
      throw new BadRequestException("You cannot delete your own account");
    }
    const target = await this.users.findOne({
      where: { id: args.targetUserId },
    });
    if (!target) throw new NotFoundException("User not found");
    if (target.role === "admin") {
      throw new ForbiddenException("Cannot delete another admin");
    }
    const counts = await this.purgeUser(target);
    this.logger.log(
      `[ADMIN] users.adminDeleteUser ok actor=admin actorId=${args.actingUserId} targetUserId=${target.id} email=${target.email} s3Keys=${counts.s3Keys}`,
    );
    return { ok: true };
  }

  /**
   * Delete a user plus every S3 object they own. Without this the FK
   * cascades drop DB rows but the bucket fills up with orphaned video/gif/
   * screenshot/audio/avatar/thumbnail objects. We collect the keys first
   * (so the cascade hasn't deleted the rows yet), then wipe S3, then drop
   * the user — DB is the source of truth, so leaving an orphaned S3 object
   * (S3 delete failed, DB delete succeeded) is the lesser evil.
   */
  private async purgeUser(user: User): Promise<{ s3Keys: number }> {
    const keys = new Set<string>();
    if (user.avatarS3Key) keys.add(user.avatarS3Key);

    const collect = async (sql: string) => {
      const rows = await this.users.manager.query<Array<{ s3Key: string }>>(
        sql,
        [user.id],
      );
      for (const r of rows) if (r.s3Key) keys.add(r.s3Key);
    };
    // Each entity table has an `s3Key` column on rows owned by this user.
    // Thumbnails are joined through videos so we follow the FK explicitly.
    await Promise.all([
      collect(`SELECT "s3Key" FROM videos WHERE "ownerId" = $1`),
      collect(`SELECT "s3Key" FROM gifs WHERE "ownerId" = $1`),
      collect(`SELECT "s3Key" FROM screenshots WHERE "ownerId" = $1`),
      collect(`SELECT "s3Key" FROM audio_templates WHERE "ownerId" = $1`),
      collect(
        `SELECT t."s3Key" FROM thumbnails t
           INNER JOIN videos v ON v.id = t."videoId"
           WHERE v."ownerId" = $1`,
      ),
    ]);

    await Promise.all(
      [...keys].map((key) =>
        this.s3.deleteObject(key).catch((err) => {
          this.logger.warn(
            `Failed to delete S3 object ${key} during purge of ${user.id}: ${(err as Error).message}`,
          );
        }),
      ),
    );

    await this.users.delete({ id: user.id });
    return { s3Keys: keys.size };
  }

  async signUp(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<SignUpResult> {
    const email = input.email.toLowerCase();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException(
        "An account with this email already exists",
      );
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);
    const link = `${this.config.getOrThrow<string>("WEB_ORIGIN")}/confirm?token=${rawToken}`;

    // Always create the account as unverified with a stored token. If the
    // mail provider is broken (Resend rejecting the from-address, missing
    // API key, etc.) we still keep the token around so a "resend
    // confirmation" flow or admin manual-verify works later. The previous
    // version auto-verified on mail failure, which silently bypassed every
    // verification gate downstream — exactly the wrong fallback.
    let mailSent = false;
    try {
      await this.mail.sendConfirmation(email, link);
      mailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to send confirmation email to ${email}: ${(err as Error).message}`,
      );
    }

    const user = this.users.create({
      email,
      name: input.name,
      googleId: null,
      avatarUrl: null,
      passwordHash,
      status: "unverified",
      confirmationTokenHash: tokenHash,
      confirmationTokenExpiresAt: expiresAt,
    });
    await this.users.save(user);
    // Generate the URL-safe handle now so a brand-new user already has
    // a /@profile reachable (their own page would be empty but at least
    // the link works from any other user's content they appear on).
    await this.ensureUsername(user);

    this.logger.log(
      `users.signUp ok email=${email} userId=${user.id} mailSent=${mailSent}`,
    );

    // Fire-and-forget admin notification — never block signup on it.
    this.mail
      .notifyAdminsOfSignup({ name: input.name, email })
      .catch((err) =>
        this.logger.warn(
          `Failed to notify admins of new signup ${email}: ${(err as Error).message}`,
        ),
      );

    return { status: "pending", email, mailSent };
  }

  /**
   * Mints a fresh confirmation token and re-sends the email. Useful when the
   * first attempt was rejected by the provider or got buried in spam. Safe
   * to call repeatedly — each call invalidates the previous token.
   */
  async resendConfirmation(email: string): Promise<{ ok: true; mailSent: boolean }> {
    const lower = email.toLowerCase();
    this.logger.log(`users.resendConfirmation attempt email=${lower}`);
    const user = await this.users.findOne({ where: { email: lower } });
    // Don't leak whether an account exists — pretend success either way.
    if (!user || user.status === "verified") {
      return { ok: true, mailSent: true };
    }
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);
    user.confirmationTokenHash = tokenHash;
    user.confirmationTokenExpiresAt = expiresAt;
    await this.users.save(user);
    const link = `${this.config.getOrThrow<string>("WEB_ORIGIN")}/confirm?token=${rawToken}`;
    let mailSent = false;
    try {
      await this.mail.sendConfirmation(lower, link);
      mailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to re-send confirmation email to ${lower}: ${(err as Error).message}`,
      );
    }
    return { ok: true, mailSent };
  }

  async confirmSignUp(token: string): Promise<{
    id: string;
    email: string;
    name: string;
  }> {
    const tokenHash = sha256(token);
    const user = await this.users.findOne({
      where: { confirmationTokenHash: tokenHash },
    });
    if (!user) {
      throw new NotFoundException("Invalid or expired confirmation link");
    }
    if (
      !user.confirmationTokenExpiresAt ||
      user.confirmationTokenExpiresAt.getTime() < Date.now()
    ) {
      // Stale token — null it so the link can't be reused.
      user.confirmationTokenHash = null;
      user.confirmationTokenExpiresAt = null;
      await this.users.save(user);
      throw new NotFoundException("Invalid or expired confirmation link");
    }
    user.status = "verified";
    user.confirmationTokenHash = null;
    user.confirmationTokenExpiresAt = null;
    await this.users.save(user);
    this.logger.log(
      `users.confirmSignUp ok userId=${user.id} email=${user.email}`,
    );
    return { id: user.id, email: user.email, name: user.name };
  }

  /**
   * Daily-cron entry point. Finds unverified users who haven't been
   * reminded recently and haven't hit the cap, mints a fresh
   * confirmation token (the original almost certainly expired — TTL is
   * 24h), and sends the reminder. Returns counters for the cron's log.
   */
  async sendConfirmationReminders(): Promise<{
    considered: number;
    sent: number;
    failed: number;
    capped: number;
  }> {
    const MAX_REMINDERS = 3;
    // Hold off on the very first reminder for ~24h after signup so the
    // welcome email + this one don't land back-to-back.
    const FIRST_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;
    // Spacing between reminders. 23h (not 24) so a slightly-late cron
    // run doesn't accidentally skip a day.
    const MIN_INTERVAL_MS = 23 * 60 * 60 * 1000;

    const now = Date.now();
    const signupCutoff = new Date(now - FIRST_REMINDER_DELAY_MS);
    const lastSentCutoff = new Date(now - MIN_INTERVAL_MS);

    const candidates = await this.users.find({
      where: {
        status: "unverified",
        confirmationRemindersSent: LessThan(MAX_REMINDERS),
        createdAt: LessThan(signupCutoff),
        // Either the user has never been reminded, or the last reminder
        // was long enough ago. Or() composes both into a single SQL OR.
        lastConfirmationReminderAt: Or(IsNull(), LessThan(lastSentCutoff)),
      },
      select: ["id", "email", "name", "confirmationRemindersSent"],
      // Cap per-run so a backlog (e.g., a long outage) doesn't spike
      // egress on the mail provider all at once.
      take: 200,
    });

    let sent = 0;
    let failed = 0;
    const webOrigin = this.config.getOrThrow<string>("WEB_ORIGIN");

    for (const user of candidates) {
      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = sha256(rawToken);
      const expiresAt = new Date(now + CONFIRMATION_TTL_MS);
      const link = `${webOrigin}/confirm?token=${rawToken}`;
      const nextAttempt = user.confirmationRemindersSent + 1;

      try {
        await this.mail.sendConfirmationReminder({
          toEmail: user.email,
          link,
          attempt: nextAttempt,
          maxAttempts: MAX_REMINDERS,
        });
        // Only persist the token + counter bump once the email is on the
        // wire. If the send fails we leave the previous token in place
        // (it's hashed so unusable, but the user might still hold the
        // welcome-email link) and try again next run.
        await this.users.update(
          { id: user.id },
          {
            confirmationTokenHash: tokenHash,
            confirmationTokenExpiresAt: expiresAt,
            confirmationRemindersSent: nextAttempt,
            lastConfirmationReminderAt: new Date(),
          },
        );
        sent++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `Reminder send failed for ${user.email}: ${(err as Error).message}`,
        );
      }
    }

    return {
      considered: candidates.length,
      sent,
      failed,
      capped: MAX_REMINDERS,
    };
  }

  async verifyPassword(input: {
    email: string;
    password: string;
  }): Promise<User | null> {
    const email = input.email.toLowerCase();
    const user = await this.users
      .createQueryBuilder("u")
      .addSelect("u.passwordHash")
      .where("u.email = :email", { email })
      .getOne();
    if (!user || !user.passwordHash) {
      this.logger.warn(
        `users.verifyPassword outcome=fail email=${email} reason=no-account-or-no-password`,
      );
      return null;
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      this.logger.warn(
        `users.verifyPassword outcome=fail email=${email} userId=${user.id} reason=bad-password`,
      );
      return null;
    }
    this.logger.log(
      `users.verifyPassword outcome=ok userId=${user.id} email=${email}`,
    );
    return user;
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute the candidate username slug from name/email. Lowercased,
 * Latin-only, no separators except `-`. Names like "Іра" produce empty
 * strings; we fall back to the email local-part in that case, then to
 * a generic "user" stem if even that is non-Latin.
 */
function buildUsernameBase(name: string, email: string): string {
  const fromName = sluggify(name);
  if (fromName.length >= 3) return fromName.slice(0, 32);
  const fromEmail = sluggify(email.split("@")[0] ?? "");
  if (fromEmail.length >= 3) return fromEmail.slice(0, 32);
  return "user";
}

function sluggify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    // Drop combining marks (accents) so "café" becomes "cafe", but
    // characters with no decomposition (Cyrillic, CJK) just collapse to
    // whatever fits the Latin filter below.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^-+|-+$/g, "");
}
