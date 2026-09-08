import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.js';
import contractJson from './contract.json' with { type: 'json' };

/**
 * Runtime factory for the Prisma Next client.
 *
 * `db.ts` is the seam between the emitted contract artefacts and the runtime.
 * The factory connects lazily: the pool is created on the first query (or on an
 * explicit `db.connect()`), so this module is safe to import before the
 * environment is ready. Lifecycle (connect on boot, close on shutdown) is owned
 * by `PrismaService`, not by this module.
 *
 * `verifyMarker: 'onFirstUse'` makes the runtime compare the database marker
 * against the emitted contract on the first query and refuse to run if the
 * schema is behind — task #2, item 5 ("the app verifies the schema is current
 * on boot and refuses to serve otherwise").
 */
export interface CreateDbOptions {
  /** PostgreSQL connection string (infra `database.url`). */
  readonly url: string;
  readonly poolOptions?: {
    readonly connectionTimeoutMillis?: number;
    readonly idleTimeoutMillis?: number;
  };
}

export function createDb(options: CreateDbOptions) {
  return postgres<Contract>({
    contractJson,
    url: options.url,
    verifyMarker: 'onFirstUse',
    poolOptions: options.poolOptions,
  });
}

export type Db = ReturnType<typeof createDb>;
