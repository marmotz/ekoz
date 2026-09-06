import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { createDb, type Db } from './db.js';

/**
 * Reads the PostgreSQL connection string.
 *
 * Temporary: `database.url` is an infra config parameter, but the layered
 * configuration system (task #4) is not wired yet, so it comes straight from the
 * environment for now — same stopgap as `main.ts` for `http.host` / `http.port`.
 */
function resolveConnectionString(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env (local dev) or set it in the environment.',
    );
  }
  return url;
}

/** The Prisma Next runtime error raised when `connect()` runs on an open pool. */
function isAlreadyConnectedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'DRIVER.ALREADY_CONNECTED'
  );
}

/**
 * NestJS wrapper around the Prisma Next runtime client.
 *
 * Prisma 8 has no `PrismaClient` class to extend (unlike the shape sketched in
 * technical.md §3, which predates the Prisma Next rename): the runtime client is
 * a plain object exposing `orm` / `sql` / `raw` / `transaction`. This service
 * composes it, owns its lifecycle, and is the single injectable the rest of the
 * app depends on for database access.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);
  private readonly db: Db;

  constructor() {
    this.db = createDb({ url: resolveConnectionString() });
  }

  /** Typed ORM query surface: `prisma.orm.public.Setting.where(...)`. */
  get orm(): Db['orm'] {
    return this.db.orm;
  }

  /** Typed SQL builder lane. */
  get sql(): Db['sql'] {
    return this.db.sql;
  }

  /**
   * Raw SQL lane. Allowed for full-text search, recursive/closure queries and
   * advisory locks only (technical.md §3) — wrap it in typed repository methods,
   * never scatter it.
   */
  get raw(): Db['raw'] {
    return this.db.raw;
  }

  /** Run a closure inside a single database transaction. */
  get transaction(): Db['transaction'] {
    return this.db.transaction.bind(this.db);
  }

  /**
   * Opens the pool and forces the schema-marker check (`verifyMarker:
   * 'onFirstUse'` in `db.ts`). A stale schema or an unreachable database aborts
   * boot here rather than surfacing on the first request.
   */
  async onModuleInit(): Promise<void> {
    await this.openPool();
    await this.healthCheck();
    this.logger.log('Database connection established and schema verified');
  }

  /**
   * Opens the connection pool, tolerating a pool another module already opened.
   *
   * The Prisma Next client connects lazily: any query issued from another
   * module's `onModuleInit` (e.g. `ConfigService` reading the `settings` table)
   * opens the pool before this hook runs, and an explicit `connect()` after that
   * throws `DRIVER.ALREADY_CONNECTED`. Init-hook ordering is not something we
   * control, so a redundant connect is treated as success.
   */
  private async openPool(): Promise<void> {
    try {
      await this.db.connect();
    } catch (error) {
      if (isAlreadyConnectedError(error)) {
        return;
      }

      throw error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.close();
  }

  /** `SELECT 1` round-trip; also triggers marker verification on first call. */
  async healthCheck(): Promise<void> {
    await this.db.raw.sql`SELECT 1`;
  }
}
