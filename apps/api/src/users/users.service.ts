import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly s3: S3Service,
    private readonly media: MediaService,
  ) {}

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
      return await this.users.save(created);
    } catch (err) {
      // Race: a concurrent OAuth callback for the same user just inserted.
      // The unique index on email/googleId throws a 23505 unique_violation;
      // re-fetch and return the winner so both callers see a stable user.
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        const winner = await this.users.findOne({
          where: { googleId: payload.sub },
        });
        if (winner) return winner;
      }
      throw err;
    }
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.users.findOne({ where: { id } });
    if (user) await this.syncRoleFromEnv(user);
    return user;
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
    if (user.role !== target) {
      user.role = target;
      await this.users.update({ id: user.id }, { role: target });
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
        | "avatarUrl"
        | "createdAt"
      >
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
    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status,
        role: u.role,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
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
    return { ok: true };
  }

  async deleteSelf(userId: string): Promise<{ ok: true }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    await this.purgeUser(user);
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
    await this.purgeUser(target);
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
  private async purgeUser(user: User): Promise<void> {
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
    return { id: user.id, email: user.email, name: user.name };
  }

  async verifyPassword(input: {
    email: string;
    password: string;
  }): Promise<User | null> {
    const user = await this.users
      .createQueryBuilder("u")
      .addSelect("u.passwordHash")
      .where("u.email = :email", { email: input.email.toLowerCase() })
      .getOne();
    if (!user || !user.passwordHash) return null;
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    return ok ? user : null;
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
