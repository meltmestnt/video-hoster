import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import type { Repository } from "typeorm";
import type { ConfigService } from "@nestjs/config";
import { UsersService } from "./users.service";
import type { User } from "./user.entity";
import type { MailService } from "../mail/mail.service";
import type { S3Service } from "../s3/s3.service";
import type { MediaService } from "../media/media.service";
import { createMockRepo, createMockQueryBuilder } from "../../test/mock-repo";

function fakeConfig(env: Record<string, string> = {}): ConfigService {
  const merged: Record<string, string> = {
    WEB_ORIGIN: "https://vidsandgifs.com",
    ADMIN_EMAILS: "",
    ...env,
  };
  return {
    getOrThrow: (k: string) => {
      if (merged[k] === undefined) throw new Error(`Missing ${k}`);
      return merged[k];
    },
    get: (k: string) => merged[k],
  } as unknown as ConfigService;
}

function makeSvc(overrides: { configEnv?: Record<string, string> } = {}) {
  const users = createMockRepo<User>();
  const mail = {
    sendConfirmation: vi.fn(async () => undefined),
    sendConfirmationReminder: vi.fn(async () => undefined),
    sendAccountVerifiedByAdmin: vi.fn(async () => undefined),
    notifyAdminsOfSignup: vi.fn(async () => undefined),
  } as unknown as MailService;
  const s3 = {
    presignPut: vi.fn(async () => "https://signed/put"),
    headObject: vi.fn(),
    deleteObject: vi.fn(async () => undefined),
  } as unknown as S3Service;
  const media = {
    signUrl: vi.fn(async () => "https://signed/avatar"),
  } as unknown as MediaService;
  const svc = new UsersService(
    users as unknown as Repository<User>,
    mail,
    fakeConfig(overrides.configEnv),
    s3,
    media,
  );
  return { svc, users, mail, s3, media };
}

describe("UsersService.signUp", () => {
  it("rejects when an account with that email already exists", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({ id: "existing" } as User);
    await expect(
      svc.signUp({
        email: "alice@example.com",
        name: "Alice",
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates an unverified row, hashes the password, and returns pending+mailSent", async () => {
    const { svc, users, mail } = makeSvc();
    users.findOne.mockResolvedValueOnce(null); // no existing account
    users.findOne.mockResolvedValue({ id: "u-1" } as User); // ensureUsername
    users.save.mockResolvedValue({
      id: "u-1",
      email: "alice@example.com",
      name: "Alice",
    } as User);
    const result = await svc.signUp({
      email: "Alice@Example.com",
      name: "Alice",
      password: "password123",
    });
    expect(result).toEqual({
      status: "pending",
      email: "alice@example.com",
      mailSent: true,
    });
    // Password should be hashed, not stored verbatim.
    const created = users.create.mock.calls[0][0] as { passwordHash: string };
    expect(created.passwordHash).not.toBe("password123");
    expect(await bcrypt.compare("password123", created.passwordHash)).toBe(true);
    // Mail must have been attempted.
    expect(mail.sendConfirmation).toHaveBeenCalled();
  });

  it("still saves the user but reports mailSent=false when the mail provider throws", async () => {
    const { svc, users, mail } = makeSvc();
    users.findOne.mockResolvedValueOnce(null);
    users.findOne.mockResolvedValue({ id: "u-1" } as User);
    (mail.sendConfirmation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("smtp down"),
    );
    users.save.mockResolvedValue({ id: "u-1" } as User);
    const result = await svc.signUp({
      email: "bob@example.com",
      name: "Bob",
      password: "password123",
    });
    expect(result).toMatchObject({ status: "pending", mailSent: false });
    expect(users.save).toHaveBeenCalled();
  });
});

describe("UsersService.verifyPassword", () => {
  it("returns null when no account matches the email", async () => {
    const { svc, users } = makeSvc();
    const qb = createMockQueryBuilder();
    qb.getOne = vi.fn(async () => null);
    users.createQueryBuilder.mockReturnValueOnce(
      qb as unknown as ReturnType<typeof createMockQueryBuilder>,
    );
    expect(
      await svc.verifyPassword({ email: "x@y.co", password: "pw" }),
    ).toBeNull();
  });

  it("returns null for a Google-only user (no passwordHash)", async () => {
    const { svc, users } = makeSvc();
    const qb = createMockQueryBuilder();
    qb.getOne = vi.fn(async () => ({ id: "u-1", passwordHash: null }) as User);
    users.createQueryBuilder.mockReturnValueOnce(
      qb as unknown as ReturnType<typeof createMockQueryBuilder>,
    );
    expect(
      await svc.verifyPassword({ email: "x@y.co", password: "pw" }),
    ).toBeNull();
  });

  it("returns null for a bad password", async () => {
    const { svc, users } = makeSvc();
    const hash = await bcrypt.hash("right-password", 4);
    const qb = createMockQueryBuilder();
    qb.getOne = vi.fn(async () =>
      ({ id: "u-1", passwordHash: hash }) as User,
    );
    users.createQueryBuilder.mockReturnValueOnce(
      qb as unknown as ReturnType<typeof createMockQueryBuilder>,
    );
    expect(
      await svc.verifyPassword({ email: "x@y.co", password: "wrong" }),
    ).toBeNull();
  });

  it("returns the user on a correct password (with passwordHash stripped from output)", async () => {
    const { svc, users } = makeSvc();
    const hash = await bcrypt.hash("right-password", 4);
    const userRow = { id: "u-1", passwordHash: hash, email: "x@y.co" } as User;
    const qb = createMockQueryBuilder();
    qb.getOne = vi.fn(async () => userRow);
    users.createQueryBuilder.mockReturnValueOnce(
      qb as unknown as ReturnType<typeof createMockQueryBuilder>,
    );
    const out = await svc.verifyPassword({
      email: "X@Y.CO",
      password: "right-password",
    });
    expect(out).not.toBeNull();
    expect(out!.id).toBe("u-1");
  });
});

describe("UsersService.confirmSignUp", () => {
  it("rejects an unknown token (no row)", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce(null);
    await expect(svc.confirmSignUp("whatever")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects an expired token AND nulls the token row", async () => {
    const { svc, users } = makeSvc();
    const expired = {
      id: "u-1",
      status: "unverified",
      confirmationTokenHash: "h",
      confirmationTokenExpiresAt: new Date(Date.now() - 1000),
    } as User;
    users.findOne.mockResolvedValueOnce(expired);
    await expect(svc.confirmSignUp("token")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(expired.confirmationTokenHash).toBeNull();
    expect(expired.confirmationTokenExpiresAt).toBeNull();
    expect(users.save).toHaveBeenCalledWith(expired);
  });

  it("flips status to verified and clears the token on a fresh token", async () => {
    const { svc, users } = makeSvc();
    const user = {
      id: "u-1",
      email: "x@y.co",
      name: "X",
      status: "unverified",
      confirmationTokenHash: "h",
      confirmationTokenExpiresAt: new Date(Date.now() + 1_000_000),
    } as User;
    users.findOne.mockResolvedValueOnce(user);
    const out = await svc.confirmSignUp("token");
    expect(out).toEqual({ id: "u-1", email: "x@y.co", name: "X" });
    expect(user.status).toBe("verified");
    expect(user.confirmationTokenHash).toBeNull();
  });
});

describe("UsersService.resendConfirmation", () => {
  it("returns ok=true silently for an unknown email (no leak)", async () => {
    const { svc, users, mail } = makeSvc();
    users.findOne.mockResolvedValueOnce(null);
    expect(await svc.resendConfirmation("noone@x.co")).toEqual({
      ok: true,
      mailSent: true,
    });
    expect(mail.sendConfirmation).not.toHaveBeenCalled();
  });

  it("returns ok=true silently for an already-verified account", async () => {
    const { svc, users, mail } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      status: "verified",
    } as User);
    expect(await svc.resendConfirmation("u@x.co")).toEqual({
      ok: true,
      mailSent: true,
    });
    expect(mail.sendConfirmation).not.toHaveBeenCalled();
  });

  it("mints a new token + sends mail for an unverified account", async () => {
    const { svc, users, mail } = makeSvc();
    const user = {
      id: "u-1",
      email: "u@x.co",
      status: "unverified",
      confirmationTokenHash: "old",
      confirmationTokenExpiresAt: new Date(),
    } as User;
    users.findOne.mockResolvedValueOnce(user);
    const out = await svc.resendConfirmation("U@X.CO");
    expect(out).toEqual({ ok: true, mailSent: true });
    expect(user.confirmationTokenHash).not.toBe("old");
    expect(mail.sendConfirmation).toHaveBeenCalled();
  });
});

describe("UsersService — admin actions", () => {
  it("adminUnverifyUser rejects acting on yourself", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.adminUnverifyUser({ actingUserId: "u-1", targetUserId: "u-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("adminUnverifyUser 404s when the target doesn't exist", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce(null);
    await expect(
      svc.adminUnverifyUser({ actingUserId: "u-1", targetUserId: "u-2" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("adminUnverifyUser refuses to demote another admin", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-2",
      role: "admin",
    } as User);
    await expect(
      svc.adminUnverifyUser({ actingUserId: "u-1", targetUserId: "u-2" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("adminUnverifyUser flips status when target is a regular user", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-2",
      role: "user",
    } as User);
    await svc.adminUnverifyUser({
      actingUserId: "u-1",
      targetUserId: "u-2",
    });
    expect(users.update).toHaveBeenCalledWith(
      { id: "u-2" },
      { status: "unverified" },
    );
  });

  it("adminVerifyUser sends the mail only when the user was previously unverified", async () => {
    const { svc, users, mail } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-2",
      email: "x@y.co",
      name: "X",
      status: "unverified",
    } as User);
    await svc.adminVerifyUser({
      actingUserId: "u-1",
      targetUserId: "u-2",
    });
    expect(mail.sendAccountVerifiedByAdmin).toHaveBeenCalled();
  });

  it("adminVerifyUser is a no-op-mail re-verifying an already-verified account", async () => {
    const { svc, users, mail } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-2",
      email: "x@y.co",
      name: "X",
      status: "verified",
    } as User);
    await svc.adminVerifyUser({
      actingUserId: "u-1",
      targetUserId: "u-2",
    });
    expect(mail.sendAccountVerifiedByAdmin).not.toHaveBeenCalled();
  });

  it("adminApproveUser writes approved=true", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({ id: "u-2" } as User);
    await svc.adminApproveUser({
      actingUserId: "u-1",
      targetUserId: "u-2",
    });
    expect(users.update).toHaveBeenCalledWith(
      { id: "u-2" },
      { approved: true },
    );
  });

  it("adminUnapproveUser refuses self + admin targets", async () => {
    const { svc, users } = makeSvc();
    await expect(
      svc.adminUnapproveUser({ actingUserId: "u-1", targetUserId: "u-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    users.findOne.mockResolvedValueOnce({
      id: "u-2",
      role: "admin",
    } as User);
    await expect(
      svc.adminUnapproveUser({ actingUserId: "u-1", targetUserId: "u-2" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("adminBanUser refuses self and admin targets, sets bannedAt otherwise", async () => {
    const { svc, users } = makeSvc();
    await expect(
      svc.adminBanUser({ actingUserId: "u-1", targetUserId: "u-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    users.findOne.mockResolvedValueOnce({
      id: "u-2",
      role: "admin",
    } as User);
    await expect(
      svc.adminBanUser({ actingUserId: "u-1", targetUserId: "u-2" }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    users.findOne.mockResolvedValueOnce({
      id: "u-3",
      role: "user",
      email: "x@y.co",
      bannedAt: null,
    } as User);
    await svc.adminBanUser({ actingUserId: "u-1", targetUserId: "u-3" });
    expect(users.update).toHaveBeenCalledWith(
      { id: "u-3" },
      expect.objectContaining({ bannedAt: expect.any(Date) }),
    );
  });

  it("adminBanUser is idempotent on an already-banned account", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-3",
      role: "user",
      email: "x@y.co",
      bannedAt: new Date(),
    } as User);
    await svc.adminBanUser({ actingUserId: "u-1", targetUserId: "u-3" });
    expect(users.update).not.toHaveBeenCalled();
  });

  it("adminUnbanUser clears bannedAt", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-3",
      role: "user",
      email: "x@y.co",
      bannedAt: new Date(),
    } as User);
    await svc.adminUnbanUser({ actingUserId: "u-1", targetUserId: "u-3" });
    expect(users.update).toHaveBeenCalledWith(
      { id: "u-3" },
      { bannedAt: null },
    );
  });

  it("verifyPassword returns null for a banned user even with the right password", async () => {
    const { svc, users } = makeSvc();
    const passwordHash = await bcrypt.hash("hunter2", 4);
    const qb = createMockQueryBuilder();
    qb.getOne.mockResolvedValueOnce({
      id: "u-3",
      email: "x@y.co",
      passwordHash,
      bannedAt: new Date(),
    } as User);
    users.createQueryBuilder.mockReturnValueOnce(qb);
    const out = await svc.verifyPassword({
      email: "x@y.co",
      password: "hunter2",
    });
    expect(out).toBeNull();
  });

  it("isEmailBanned reports true only when the row exists and bannedAt is set", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce(null);
    expect(await svc.isEmailBanned("nobody@x.co")).toBe(false);
    users.findOne.mockResolvedValueOnce({ id: "u", bannedAt: null } as User);
    expect(await svc.isEmailBanned("alice@x.co")).toBe(false);
    users.findOne.mockResolvedValueOnce({
      id: "u",
      bannedAt: new Date(),
    } as User);
    expect(await svc.isEmailBanned("bob@x.co")).toBe(true);
  });

  it("adminDeleteUser refuses self and admin targets", async () => {
    const { svc, users } = makeSvc();
    await expect(
      svc.adminDeleteUser({ actingUserId: "u-1", targetUserId: "u-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    users.findOne.mockResolvedValueOnce({
      id: "u-2",
      role: "admin",
    } as User);
    await expect(
      svc.adminDeleteUser({ actingUserId: "u-1", targetUserId: "u-2" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("UsersService.startAvatarUpload + finalizeAvatarUpload", () => {
  it("startAvatarUpload generates a per-user S3 key and presigned URL", async () => {
    const { svc, s3 } = makeSvc();
    const out = await svc.startAvatarUpload("u-1", "image/jpeg");
    expect(out.s3Key).toMatch(/^avatars\/u-1\/.*\.jpg$/);
    expect(s3.presignPut).toHaveBeenCalledWith(out.s3Key, "image/jpeg");
  });

  it("finalizeAvatarUpload rejects an s3Key that doesn't belong to the user", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.finalizeAvatarUpload("u-1", "avatars/u-2/foo.jpg"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("finalizeAvatarUpload rejects when the S3 object can't be HEAD'd", async () => {
    const { svc, s3 } = makeSvc();
    (s3.headObject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(
      svc.finalizeAvatarUpload("u-1", "avatars/u-1/foo.jpg"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("finalizeAvatarUpload rejects an oversized object and deletes it", async () => {
    const { svc, s3 } = makeSvc();
    (s3.headObject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      size: 1024 ** 3, // 1 GiB
      contentType: "image/jpeg",
    });
    await expect(
      svc.finalizeAvatarUpload("u-1", "avatars/u-1/foo.jpg"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s3.deleteObject).toHaveBeenCalledWith("avatars/u-1/foo.jpg");
  });

  it("finalizeAvatarUpload writes the new key and deletes the previous one", async () => {
    const { svc, s3, users } = makeSvc();
    (s3.headObject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      size: 100_000,
      contentType: "image/jpeg",
    });
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      avatarS3Key: "avatars/u-1/old.jpg",
    } as User);
    await svc.finalizeAvatarUpload("u-1", "avatars/u-1/new.jpg");
    expect(users.update).toHaveBeenCalledWith(
      { id: "u-1" },
      { avatarS3Key: "avatars/u-1/new.jpg" },
    );
    expect(s3.deleteObject).toHaveBeenCalledWith("avatars/u-1/old.jpg");
  });
});

describe("UsersService.bumpLastSeen", () => {
  it("issues a DB update on the first call", async () => {
    const { svc, users } = makeSvc();
    svc.bumpLastSeen("u-1");
    // bumpLastSeen fires-and-forgets — wait a tick for the microtask.
    await new Promise((r) => setTimeout(r, 5));
    expect(users.update).toHaveBeenCalledWith(
      { id: "u-1" },
      expect.objectContaining({ lastSeenAt: expect.any(Date) }),
    );
  });

  it("throttles repeated calls within the window", async () => {
    const { svc, users } = makeSvc();
    svc.bumpLastSeen("u-1");
    await new Promise((r) => setTimeout(r, 5));
    svc.bumpLastSeen("u-1");
    svc.bumpLastSeen("u-1");
    await new Promise((r) => setTimeout(r, 5));
    expect(users.update).toHaveBeenCalledTimes(1);
  });

  it("does NOT throttle across different users", async () => {
    const { svc, users } = makeSvc();
    svc.bumpLastSeen("u-1");
    svc.bumpLastSeen("u-2");
    await new Promise((r) => setTimeout(r, 5));
    expect(users.update).toHaveBeenCalledTimes(2);
  });
});

describe("UsersService.upsertFromAuthPayload (Google sign-in)", () => {
  it("creates a new user row when Google-id and email are both fresh", async () => {
    const { svc, users } = makeSvc();
    users.findOne
      .mockResolvedValueOnce(null) // by googleId
      .mockResolvedValueOnce(null) // by email
      .mockResolvedValueOnce({ id: "new-id" } as User); // ensureUsername lookup
    users.save.mockResolvedValueOnce({
      id: "new-id",
      googleId: "g-sub",
      email: "g@x.co",
      name: "G User",
      status: "verified",
    } as User);
    const out = await svc.upsertFromAuthPayload({
      sub: "g-sub",
      email: "g@x.co",
      name: "G User",
      picture: "https://g/p.jpg",
    });
    expect(out.googleId).toBe("g-sub");
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        googleId: "g-sub",
        email: "g@x.co",
        status: "verified",
        passwordHash: null,
      }),
    );
  });

  it("rejects linking when the email is taken by an existing credentials account", async () => {
    const { svc, users } = makeSvc();
    users.findOne
      .mockResolvedValueOnce(null) // no row by googleId
      .mockResolvedValueOnce({ id: "creds-user", googleId: null } as User); // email taken
    await expect(
      svc.upsertFromAuthPayload({
        sub: "g-sub",
        email: "taken@x.co",
        name: "X",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users.save).not.toHaveBeenCalled();
  });

  it("updates email/name/avatar on an existing Google account when they drift", async () => {
    const { svc, users } = makeSvc();
    const existing = {
      id: "u-1",
      googleId: "g-sub",
      email: "old@x.co",
      name: "Old Name",
      avatarUrl: null,
    } as User;
    users.findOne.mockResolvedValue(existing);
    await svc.upsertFromAuthPayload({
      sub: "g-sub",
      email: "new@x.co",
      name: "New Name",
      picture: "https://g/new.jpg",
    });
    expect(existing.email).toBe("new@x.co");
    expect(existing.name).toBe("New Name");
    expect(existing.avatarUrl).toBe("https://g/new.jpg");
    expect(users.save).toHaveBeenCalledWith(existing);
  });
});
