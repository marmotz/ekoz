import { isDatabaseUnreachable, summarizeError } from '../observability/error-report.js';
import { createDb } from './db.js';

/** Pauses between attempts: 1 attempt + 3 retries, then the last error is thrown. */
export const DATABASE_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 5_000];

export interface WaitForDatabaseOptions {
  /** Runs one connectivity probe; rejects when the database is not usable. */
  readonly probe?: () => Promise<void>;
  readonly delaysMs?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (line: string) => void;
}

async function probeDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // `PrismaService` reports the missing variable with a dedicated message.
    return;
  }

  const db = createDb({ url });
  try {
    await db.connect();
    // A real ORM query: it triggers the marker check and actually hits the wire
    // (`raw.sql` alone only builds a plan).
    await db.orm.public.Setting.where({ key: '__boot_probe__' }).first();
  } finally {
    await db.close().catch(() => undefined);
  }
}

/**
 * Blocks boot until the database answers, retrying only while it is
 * unreachable (connection refused, DNS failure, timeout...). Any other failure
 * (bad credentials, stale schema) is not transient and is thrown immediately.
 *
 * Runs before `NestFactory.create` so a database that starts a few seconds after
 * the API does not abort boot — see docs/technical/error-reporting.md.
 */
export async function waitForDatabase(options: WaitForDatabaseOptions = {}): Promise<void> {
  const probe = options.probe ?? probeDatabase;
  const delays = options.delaysMs ?? DATABASE_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`));

  for (let attempt = 0; ; attempt++) {
    try {
      await probe();
      return;
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !isDatabaseUnreachable(error)) {
        throw error;
      }

      log(
        `Database unreachable (${summarizeError(error)}). ` +
          `Retry ${attempt + 1}/${delays.length} in ${delay / 1000}s...`,
      );
      await sleep(delay);
    }
  }
}
