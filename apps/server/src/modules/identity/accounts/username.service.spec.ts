import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../../core/audit/audit.service.js';
import type { ConfigService } from '../../../core/config/config.service.js';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  UsernameChangeCooldownError,
  UsernameChangeRequestNotFoundError,
  UsernameChangeRequestResolvedError,
  UsernameRequestPendingError,
} from '../identity.errors.js';
import type { AccountService } from './account.service.js';
import type { IdentifierService } from './identifier.service.js';
import { UsernameService } from './username.service.js';

type Row = Record<string, unknown>;

/** A tiny in-memory stand-in for one ORM collection (`where`, `first`, `create`, `update`, `all`). */
function makeTable(rows: Row[] = []) {
  const matching = (filter: Row) =>
    rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v));
  const query = (filter: Row) => ({
    first: async () => matching(filter)[0] ?? null,
    all: async () => matching(filter),
    orderBy: () => ({
      first: async () =>
        [...matching(filter)].sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] ?? null,
    }),
    update: async (patch: Row) => {
      for (const row of matching(filter)) Object.assign(row, patch);
    },
  });

  return {
    rows,
    where: query,
    first: async (filter: Row) => query(filter).first(),
    all: async () => rows,
    create: async (data: Row) => {
      const row = { id: `req-${rows.length + 1}`, createdAt: new Date().toISOString(), ...data };
      rows.push(row);

      return row;
    },
  };
}

function makeService(options: { policy?: string; cooldown?: number; lastChange?: string } = {}) {
  const config: Record<string, unknown> = {
    'identity.username_change_policy': options.policy ?? 'approval',
    'identity.username_change_cooldown': options.cooldown ?? 0,
    'identity.username_release_delay': 0,
    'server.domain': 'ekoz.example.com',
  };
  const requests = makeTable();
  const auditLog = makeTable(
    options.lastChange
      ? [{ actorUserId: 'u1', action: 'identity.username_changed', at: options.lastChange }]
      : [],
  );
  const audit = { record: vi.fn(async () => undefined) };
  const prisma = {
    orm: { public: { UsernameChangeRequest: requests, AuditLog: auditLog } },
    transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({ orm: { public: { ReservedUsername: makeTable() } } }),
  };
  const accounts = {
    findById: vi.fn(async (id: string) => ({ id, name: 'alice' })),
    updateName: vi.fn(async () => undefined),
  };
  const identifiers = { assertAvailable: vi.fn(async (name: string) => name) };

  const service = new UsernameService(
    prisma as unknown as PrismaService,
    { get: (key: string) => config[key] } as unknown as ConfigService,
    accounts as unknown as AccountService,
    identifiers as unknown as IdentifierService,
    audit as unknown as AuditService,
  );

  return { service, requests, audit };
}

describe('UsernameService (unit)', () => {
  describe('stateOf', () => {
    it.each(['immutable', 'available', 'approval'])('reports the %s policy', async (policy) => {
      const { service } = makeService({ policy });

      expect(await service.stateOf('u1')).toEqual({
        policy,
        nextChangeAt: null,
        pendingRequest: null,
      });
    });

    it('reports the cooldown end for `available` while it runs', async () => {
      const lastChange = new Date(Date.now() - 60_000).toISOString();
      const { service } = makeService({ policy: 'available', cooldown: 3600, lastChange });

      const state = await service.stateOf('u1');
      expect(state.nextChangeAt).toBe(new Date(Date.parse(lastChange) + 3600_000).toISOString());
    });

    it('reports no cooldown once it has elapsed or when there is no earlier change', async () => {
      const old = new Date(Date.now() - 7200_000).toISOString();

      expect(
        (
          await makeService({
            policy: 'available',
            cooldown: 3600,
            lastChange: old,
          }).service.stateOf('u1')
        ).nextChangeAt,
      ).toBeNull();
      expect(
        (await makeService({ policy: 'available', cooldown: 3600 }).service.stateOf('u1'))
          .nextChangeAt,
      ).toBeNull();
    });

    it('never reports a cooldown outside `available`', async () => {
      const lastChange = new Date().toISOString();
      const { service } = makeService({ policy: 'approval', cooldown: 3600, lastChange });

      expect((await service.stateOf('u1')).nextChangeAt).toBeNull();
    });

    it('returns the pending request whatever the current policy', async () => {
      const { service } = makeService({ policy: 'approval' });
      await service.changeOwn('u1', 'alice2');
      const stored = await service.stateOf('u1');
      expect(stored.pendingRequest).toMatchObject({ requestedName: 'alice2' });

      const immutable = makeService({ policy: 'immutable' });
      await immutable.requests.create({
        userId: 'u1',
        requestedName: 'alice3',
        status: 'pending',
      });
      expect((await immutable.service.stateOf('u1')).pendingRequest).toMatchObject({
        requestedName: 'alice3',
      });
    });

    it('ignores resolved requests and other users', async () => {
      const { service, requests } = makeService();
      await requests.create({ userId: 'u1', requestedName: 'a', status: 'rejected' });
      await requests.create({ userId: 'u2', requestedName: 'b', status: 'pending' });

      expect((await service.stateOf('u1')).pendingRequest).toBeNull();
    });
  });

  describe('changeOwn (approval)', () => {
    it('queues a request, then refuses a second one while it is pending', async () => {
      const { service, requests } = makeService();

      expect(await service.changeOwn('u1', 'alice2')).toMatchObject({ status: 'pending' });
      await expect(service.changeOwn('u1', 'alice3')).rejects.toBeInstanceOf(
        UsernameRequestPendingError,
      );
      expect(requests.rows).toHaveLength(1);
    });

    it('allows a new request once the previous one is cancelled', async () => {
      const { service, requests } = makeService();
      await service.changeOwn('u1', 'alice2');
      await service.cancelOwnRequest('u1');

      expect(await service.changeOwn('u1', 'alice3')).toMatchObject({ status: 'pending' });
      expect(requests.rows).toHaveLength(2);
    });
  });

  describe('changeOwn (available)', () => {
    it('still refuses inside the cooldown', async () => {
      const { service } = makeService({
        policy: 'available',
        cooldown: 3600,
        lastChange: new Date().toISOString(),
      });

      await expect(service.changeOwn('u1', 'alice2')).rejects.toBeInstanceOf(
        UsernameChangeCooldownError,
      );
    });
  });

  describe('cancelOwnRequest', () => {
    it('marks the pending request cancelled and audits it', async () => {
      const { service, requests, audit } = makeService();
      await service.changeOwn('u1', 'alice2');

      await service.cancelOwnRequest('u1');

      expect(requests.rows[0]).toMatchObject({
        status: 'cancelled',
        resolvedByUserId: 'u1',
        resolvedAt: expect.any(String),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'identity.username_change_cancelled',
          actorUserId: 'u1',
        }),
      );
      expect((await service.stateOf('u1')).pendingRequest).toBeNull();
    });

    it('cancels a request created under another policy', async () => {
      const { service, requests } = makeService({ policy: 'immutable' });
      await requests.create({ userId: 'u1', requestedName: 'alice2', status: 'pending' });

      await service.cancelOwnRequest('u1');
      expect(requests.rows[0]?.status).toBe('cancelled');
    });

    it('throws when there is nothing to cancel', async () => {
      const { service } = makeService();

      await expect(service.cancelOwnRequest('u1')).rejects.toBeInstanceOf(
        UsernameChangeRequestNotFoundError,
      );
    });
  });

  describe('owner decisions on a cancelled request', () => {
    it('refuses to approve or reject it', async () => {
      const { service } = makeService();
      const outcome = await service.changeOwn('u1', 'alice2');
      await service.cancelOwnRequest('u1');
      const requestId = (outcome as { requestId: string }).requestId;

      await expect(service.approve(requestId, 'owner')).rejects.toBeInstanceOf(
        UsernameChangeRequestResolvedError,
      );
      await expect(service.reject(requestId, 'owner')).rejects.toBeInstanceOf(
        UsernameChangeRequestResolvedError,
      );
    });
  });
});
