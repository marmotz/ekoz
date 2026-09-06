import { Inject, Injectable } from '@nestjs/common';
import { SigningService } from '../crypto/signing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_DRIVER, type StorageDriver } from '../storage/storage-driver.js';

/** One readiness check outcome. */
export interface ReadinessCheck {
  ok: boolean;
  /** Failure reason; omitted when `ok`. */
  detail?: string;
}

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  checks: Record<string, ReadinessCheck>;
}

/**
 * `/readyz` dependency checks (technical.md §9): database reachable, schema
 * current, an active signing key present, storage driver writable. Any failure
 * makes the whole report `not_ready` (the controller answers `503`).
 */
@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver
  ) {}

  async check(): Promise<ReadinessReport> {
    const checks: Record<string, ReadinessCheck> = {
      database: await run(() => this.prisma.healthCheck()),
      // The Prisma Next runtime verifies the schema marker on every query and
      // refuses to run when the database is behind the contract, so a successful
      // ORM read against a committed table means migrations are current.
      migrations: await run(async () => {
        await this.prisma.orm.public.Setting.where({ key: '__readyz_probe__' }).first();
      }),
      signing_key: await run(async () => {
        if (!(await this.signing.hasActiveKey())) {
          throw new Error('no active signing key');
        }
      }),
      storage: await run(() => this.storage.healthCheck()),
    };

    const ok = Object.values(checks).every((check) => check.ok);

    return { status: ok ? 'ready' : 'not_ready', checks };
  }
}

async function run(fn: () => Promise<unknown>): Promise<ReadinessCheck> {
  try {
    await fn();

    return { ok: true };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  }
}
