import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ILike, In, Repository } from "typeorm";
import { Tag } from "./tag.entity";

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
  ) {}

  async ensureTags(rawNames: string[]): Promise<Tag[]> {
    const names = Array.from(
      new Set(rawNames.map((n) => n.trim().toLowerCase()).filter(Boolean)),
    );
    if (names.length === 0) return [];

    const existing = await this.tags.find({ where: { name: In(names) } });
    const existingNames = new Set(existing.map((t) => t.name));
    const toCreate = names
      .filter((n) => !existingNames.has(n))
      .map((name) => this.tags.create({ name }));
    if (toCreate.length > 0) {
      await this.tags.save(toCreate);
    }
    return this.tags.find({ where: { name: In(names) } });
  }

  search(q: string, limit: number): Promise<Tag[]> {
    const where = q ? { name: ILike(`${q.toLowerCase()}%`) } : {};
    return this.tags.find({ where, order: { name: "ASC" }, take: limit });
  }
}
