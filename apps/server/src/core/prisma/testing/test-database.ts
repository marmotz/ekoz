import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type Db } from '../db.js';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

type TxContext = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface TestDatabase {
  readonly url: string;
  readonly db: Db;
  /**
   * Run `fn` inside a transaction that is always rolled back — per-test
   * isolation without truncating (task #2, item 6).
   */
  inRollback(fn: (tx: TxContext) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}

const ROLLBACK = Symbol('rollback');

/**
 * Spin a real PostgreSQL 18 via Testcontainers, apply the on-disk migrations
 * with `prisma db migrate`, and hand back a connected client. No Prisma mocking
 * in integration tests (technical.md §1).
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:18',
  ).start();
  const url = container.getConnectionUri();
  const database = container.getDatabase();

  await execFileAsync(
    'bunx',
    ['prisma', 'db', 'migrate', '--no-interactive', '--confirm', database],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: url },
    },
  );

  const db = createDb({ url });
  await db.connect();

  return {
    url,
    db,
    async inRollback(fn) {
      try {
        await db.transaction(async (tx) => {
          await fn(tx);
          throw ROLLBACK;
        });
      } catch (error) {
        if (error !== ROLLBACK) throw error;
      }
    },
    async stop() {
      await db.close();
      await container.stop();
    },
  };
}
