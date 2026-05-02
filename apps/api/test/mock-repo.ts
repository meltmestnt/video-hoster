import { vi, type Mock } from "vitest";

// Explicit shape so TS doesn't try to infer the spy types out of
// vitest's nested .pnpm paths (which TS rejects as non-portable when
// other workspace packages reference this helper transitively).
export interface MockRepo {
  find: Mock;
  findOne: Mock;
  findOneBy: Mock;
  count: Mock;
  save: Mock;
  create: Mock;
  update: Mock;
  delete: Mock;
  insert: Mock;
  createQueryBuilder: Mock;
  manager: { query: Mock };
}

// Minimal Repository<T> stub. Methods are vi.fn() so each test can
// override per-call behavior with .mockResolvedValueOnce / etc. Most
// repo methods used in the codebase appear here; tests can extend
// the returned object as needed. The generic <T> survives only at
// call sites (e.g. for type-safe mock returns) — internally
// everything is typed as Mock to keep the public type portable.
export function createMockRepo<T = unknown>(): MockRepo {
  void (null as unknown as T); // keep the generic referenced for callers
  return {
    find: vi.fn(async (_args?: unknown) => [] as unknown[]),
    findOne: vi.fn(async (_args?: unknown) => null as unknown),
    findOneBy: vi.fn(async (_args?: unknown) => null as unknown),
    count: vi.fn(async (_args?: unknown) => 0),
    save: vi.fn(async (entity: unknown) => entity),
    create: vi.fn((entity: unknown) => entity),
    update: vi.fn(async (_id: unknown, _patch: unknown) => ({ affected: 1 })),
    delete: vi.fn(async (_id: unknown) => ({ affected: 1 })),
    insert: vi.fn(async (_entity: unknown) => ({ identifiers: [] })),
    createQueryBuilder: vi.fn(() => createMockQueryBuilder()),
    manager: {
      query: vi.fn(async () => [] as unknown[]),
    },
  };
}

// QueryBuilder stub. Each fluent method returns the same builder so
// long .leftJoin().where().orderBy().take() chains compose. Terminal
// methods (getMany, getOne, getRawMany, getCount) return overridable
// vi.fn() default values.
export function createMockQueryBuilder() {
  const qb: Record<string, unknown> = {};
  const passthrough = (..._args: unknown[]) => qb;
  for (const name of [
    "select",
    "addSelect",
    "where",
    "andWhere",
    "orWhere",
    "groupBy",
    "addGroupBy",
    "orderBy",
    "addOrderBy",
    "leftJoin",
    "leftJoinAndSelect",
    "innerJoin",
    "innerJoinAndSelect",
    "take",
    "limit",
    "offset",
    "skip",
    "having",
    "andHaving",
  ]) {
    qb[name] = vi.fn(passthrough);
  }
  qb.getMany = vi.fn(async () => [] as unknown[]);
  qb.getOne = vi.fn(async () => null as unknown);
  qb.getRawMany = vi.fn(async () => [] as unknown[]);
  qb.getRawOne = vi.fn(async () => null as unknown);
  qb.getCount = vi.fn(async () => 0);
  return qb as Record<string, ReturnType<typeof vi.fn>>;
}

// Cast helper so tests can pass mock-repo as Repository<T> without
// TypeScript balking. Plain `as unknown as Repository<T>` was awkward
// to type at every call site.
export function asRepo<T>(mock: ReturnType<typeof createMockRepo<T>>): T extends never ? never : ReturnType<typeof createMockRepo<T>> {
  return mock as never;
}
