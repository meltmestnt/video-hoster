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
  type AllowedAvatarMimeType,
} from "@repo/shared";
import { User } from "./user.entity";
import { MailService } from "../mail/mail.service";
import { S3Service } from "../s3/s3.service";

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
  | { status: "pending"; email: string }
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
  ) {}

  async resolveAvatarUrl(user: User): Promise<string | null> {
    if (user.avatarS3Key) {
      return this.s3.presignGet(user.avatarS3Key);
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
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    user.miniPlayerEnabled = enabled;
    user.miniPlayerPromptSeen = true;
    await this.users.save(user);
    return {
      miniPlayerEnabled: user.miniPlayerEnabled,
      miniPlayerPromptSeen: user.miniPlayerPromptSeen,
    };
  }

  async setNotifySubscribersOnUpload(
    userId: string,
    enabled: boolean,
  ): Promise<{ notifySubscribersOnUpload: boolean }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    user.notifySubscribersOnUpload = enabled;
    await this.users.save(user);
    return { notifySubscribersOnUpload: user.notifySubscribersOnUpload };
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
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const previousKey = user.avatarS3Key;
    user.avatarS3Key = s3Key;
    await this.users.save(user);

    if (previousKey && previousKey !== s3Key) {
      this.s3.deleteObject(previousKey).catch((err) => {
        this.logger.warn(
          `Failed to delete previous avatar ${previousKey}: ${(err as Error).message}`,
        );
      });
    }

    const avatarUrl = await this.s3.presignGet(s3Key);
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
      throw new ConflictException(
        "An account with this email already exists. Sign in with email/password.",
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
    return this.users.save(created);
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
    const raw = this.config.get<string>("ADMIN_EMAILS") ?? "";
    const admins = new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
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
    target.status = "unverified";
    await this.users.save(target);
    return { ok: true };
  }

  async deleteSelf(userId: string): Promise<{ ok: true }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    // FK cascades wipe owned videos/gifs/comments. S3 media will leak — same
    // tradeoff as adminDeleteUser; can be addressed by a sweeper later.
    if (user.avatarS3Key) {
      this.s3.deleteObject(user.avatarS3Key).catch((err) => {
        this.logger.warn(
          `Failed to delete avatar ${user.avatarS3Key} for self-deleted user ${user.id}: ${(err as Error).message}`,
        );
      });
    }
    await this.users.delete({ id: user.id });
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
    // FK cascades on videos/gifs/comments/etc. handle their own rows;
    // S3 objects belonging to the user will leak — out of scope for now.
    if (target.avatarS3Key) {
      this.s3.deleteObject(target.avatarS3Key).catch((err) => {
        this.logger.warn(
          `Failed to delete avatar ${target.avatarS3Key} for deleted user ${target.id}: ${(err as Error).message}`,
        );
      });
    }
    await this.users.delete({ id: target.id });
    return { ok: true };
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

    // Try to send a confirmation email, but don't block sign-up on it. When
    // the mail provider is misconfigured (Resend in sandbox, missing API key,
    // unverified domain, etc.) the user is created as already-verified so
    // they can sign in immediately. The error is still logged so an operator
    // can investigate.
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
      status: mailSent ? "unverified" : "verified",
      confirmationTokenHash: mailSent ? tokenHash : null,
      confirmationTokenExpiresAt: mailSent ? expiresAt : null,
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

    if (mailSent) {
      return { status: "pending", email };
    }
    return { status: "confirmed", id: user.id, email, name: user.name };
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
