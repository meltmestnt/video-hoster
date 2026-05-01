import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Subscription } from "./subscription.entity";
import { User } from "../users/user.entity";
import { S3Service } from "../s3/s3.service";
import { MediaService } from "../media/media.service";

export interface SubscriptionUserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  subscribedAt: Date;
}

export interface PaginatedUsers {
  items: SubscriptionUserSummary[];
  nextCursor: string | null;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly s3: S3Service,
    private readonly media: MediaService,
  ) {}

  async toggle(
    subscriberId: string,
    targetUserId: string,
  ): Promise<{ subscribed: boolean; followerCount: number }> {
    if (subscriberId === targetUserId) {
      throw new BadRequestException("You can't subscribe to yourself");
    }
    const target = await this.users.findOne({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException("User not found");

    const existing = await this.subscriptions.findOne({
      where: { subscriberId, targetUserId },
    });
    if (existing) {
      await this.subscriptions.delete({ id: existing.id });
    } else {
      await this.subscriptions.save(
        this.subscriptions.create({ subscriberId, targetUserId }),
      );
    }
    const followerCount = await this.subscriptions.count({
      where: { targetUserId },
    });
    this.logger.log(
      `subscriptions.toggle subscriberId=${subscriberId} targetUserId=${targetUserId} subscribed=${!existing}`,
    );
    return { subscribed: !existing, followerCount };
  }

  isSubscribed(subscriberId: string, targetUserId: string): Promise<boolean> {
    return this.subscriptions
      .count({ where: { subscriberId, targetUserId } })
      .then((n) => n > 0);
  }

  async followerCount(targetUserId: string): Promise<number> {
    return this.subscriptions.count({ where: { targetUserId } });
  }

  async followingCount(subscriberId: string): Promise<number> {
    return this.subscriptions.count({ where: { subscriberId } });
  }

  // The set of user ids that subscribe to `targetUserId`. Used by the
  // notifications fan-out when the target uploads new content.
  async subscriberIdsOf(targetUserId: string): Promise<string[]> {
    const rows = await this.subscriptions.find({
      where: { targetUserId },
      select: { subscriberId: true },
    });
    return rows.map((r) => r.subscriberId);
  }

  async listFollowing(
    subscriberId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<PaginatedUsers> {
    return this.paginate(
      { subscriberId },
      "targetUserId",
      cursor,
      limit,
    );
  }

  async listFollowers(
    targetUserId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<PaginatedUsers> {
    return this.paginate(
      { targetUserId },
      "subscriberId",
      cursor,
      limit,
    );
  }

  private async paginate(
    where: { subscriberId?: string; targetUserId?: string },
    userIdColumn: "subscriberId" | "targetUserId",
    cursor: string | undefined,
    limit: number,
  ): Promise<PaginatedUsers> {
    const qb = this.subscriptions
      .createQueryBuilder("s")
      .where(where)
      .orderBy("s.createdAt", "DESC")
      .addOrderBy("s.id", "DESC")
      .take(limit + 1);

    if (cursor) {
      const c = await this.subscriptions.findOne({
        where: { ...where, id: cursor },
      });
      if (c) qb.andWhere("s.createdAt < :cAt", { cAt: c.createdAt });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    if (sliced.length === 0) {
      return { items: [], nextCursor: null };
    }

    const userIds = sliced.map((r) => r[userIdColumn]);
    const users = await this.users.find({
      where: userIds.map((id) => ({ id })),
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        avatarS3Key: true,
      },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const items: SubscriptionUserSummary[] = await Promise.all(
      sliced.map(async (row) => {
        const u = userById.get(row[userIdColumn]);
        const avatarUrl =
          u && u.avatarS3Key
            ? await this.media.signUrl({ kind: "avatar", id: u.id })
            : (u?.avatarUrl ?? null);
        return {
          id: row[userIdColumn],
          name: u?.name ?? "Unknown",
          avatarUrl,
          subscribedAt: row.createdAt,
        };
      }),
    );

    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;
    return { items, nextCursor };
  }
}
