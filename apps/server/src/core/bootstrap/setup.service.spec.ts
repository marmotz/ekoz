import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import { sha256Hex } from '../crypto/hashing.js';
import { DomainError } from '../http/domain-error.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OwnerLookup } from './owner-lookup.js';
import { SetupService } from './setup.service.js';

interface TokenRow {
  id: string;
  tokenHash: string;
  consumedAt: string | null;
  createdAt: string;
}

function fakes(ownerExists = false) {
  const rows: TokenRow[] = [];
  let seq = 0;
  const SetupToken = {
    where(arg: unknown) {
      const pred =
        typeof arg === 'function'
          ? (arg as (t: { consumedAt: { isNull: () => boolean } }) => unknown)
          : null;
      const filter = typeof arg === 'object' && arg ? (arg as Partial<TokenRow>) : null;
      const match = (r: TokenRow) => {
        if (filter)
          return Object.entries(filter).every(
            ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
          );
        if (pred) return r.consumedAt === null; // only `consumedAt.isNull()` is used
        return true;
      };
      const chain = {
        orderBy: () => chain,
        all: async () => rows.filter(match),
        first: async () => rows.filter(match).at(-1) ?? null,
        update: async (patch: Partial<TokenRow>) => {
          const r = rows.filter(match).at(-1);
          if (r) Object.assign(r, patch);
        },
        delete: async () => {
          for (const r of rows.filter(match)) rows.splice(rows.indexOf(r), 1);
        },
      };

      return chain;
    },
    create: async (data: { tokenHash: string; consumedAt: string | null }) => {
      const row: TokenRow = { id: `st_${++seq}`, createdAt: new Date().toISOString(), ...data };
      rows.push(row);

      return row;
    },
  };
  const prisma = { orm: { public: { SetupToken } } } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const ownerLookup: OwnerLookup = { ownerExists: async () => ownerExists };

  return { rows, prisma, audit, ownerLookup };
}

describe('SetupService (unit)', () => {
  it('resolves to closed when an owner exists', async () => {
    const f = fakes(true);
    const service = new SetupService(f.prisma, f.audit, f.ownerLookup, {});
    expect(await service.resolveState()).toBe('closed');
  });

  it('resolves to email-pinned when EKOZ_INITIAL_OWNER_EMAIL is set', async () => {
    const f = fakes(false);
    const service = new SetupService(f.prisma, f.audit, f.ownerLookup, {
      EKOZ_INITIAL_OWNER_EMAIL: 'Owner@Example.com',
    });
    expect(await service.resolveState()).toBe('email-pinned');
    expect(service.pinnedOwnerEmail()).toBe('owner@example.com');
  });

  it('resolves to token-pinned otherwise and rotates the token on every call', async () => {
    const f = fakes(false);
    const service = new SetupService(f.prisma, f.audit, f.ownerLookup, {});
    expect(await service.resolveState()).toBe('token-pinned');

    await service.ensureSetupToken();
    const firstHash = f.rows[0]?.tokenHash;
    await service.ensureSetupToken();

    expect(f.rows).toHaveLength(1); // the earlier unconsumed token is dropped
    expect(f.rows[0]?.tokenHash).toHaveLength(64);
    expect(f.rows[0]?.tokenHash).not.toBe(firstHash);
  });

  it('drops the previous unconsumed token row when a fresh one is issued', async () => {
    const f = fakes(false);
    const service = new SetupService(f.prisma, f.audit, f.ownerLookup, {});
    await service.ensureSetupToken();
    const staleId = f.rows[0]?.id;

    await service.ensureSetupToken();

    expect(f.rows.some((r) => r.id === staleId)).toBe(false);
  });

  it('validates the generated token and rejects a wrong one', async () => {
    const f = fakes(false);
    const service = new SetupService(f.prisma, f.audit, f.ownerLookup, {});
    // seed a known token
    await f.prisma.orm.public.SetupToken.create({
      tokenHash: sha256Hex('correct-horse'),
      consumedAt: null,
    });

    expect(await service.isValidToken('correct-horse')).toBe(true);
    expect(await service.isValidToken('wrong')).toBe(false);
  });

  it('assertOpen throws 410 once closed', async () => {
    const service = new SetupService(
      fakes(true).prisma,
      fakes().audit,
      { ownerExists: async () => true },
      {},
    );
    await expect(service.assertOpen()).rejects.toBeInstanceOf(DomainError);
    await service.assertOpen().catch((e: DomainError) => expect(e.status).toBe(410));
  });

  it('completeSetup consumes the token and writes server.initialized', async () => {
    const f = fakes(false);
    const service = new SetupService(f.prisma, f.audit, f.ownerLookup, {});
    await service.ensureSetupToken();

    await service.completeSetup({ ownerUserId: 'user-1', ownerEmail: 'owner@example.com' });

    expect(f.rows[0]?.consumedAt).toBeTypeOf('string');
    expect(f.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'server.initialized', actorUserId: 'user-1' }),
    );
  });
});
