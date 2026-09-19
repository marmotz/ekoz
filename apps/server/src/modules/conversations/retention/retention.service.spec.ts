import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RoomNotFoundError } from '../conversations.errors.js';
import type { EventLogService } from '../events/event-log.service.js';
import type { PermissionsService } from '../permissions/permissions.service.js';
import { RetentionService } from './retention.service.js';

interface StubRoom {
  id: string;
  retention: unknown;
  deletedAt: string | null;
}

function makeService(options: {
  rooms: Record<string, StubRoom>;
  closures?: Array<{ ancestorId: string; descendantId: string; depth: number }>;
  defaultRule?: unknown;
}) {
  const rooms = options.rooms;
  const closures = options.closures ?? [];

  const prisma = {
    orm: {
      public: {
        Room: {
          where: (query: unknown) => {
            if (typeof query === 'object' && query !== null && 'id' in query) {
              const id = (query as { id: string }).id;
              return { first: async () => rooms[id] ?? null };
            }
            // Filter-function form: only ever used here to fetch ancestor rooms by id.
            return { all: async () => Object.values(rooms) };
          },
        },
        RoomClosure: {
          where: () => ({
            orderBy: () => ({ all: async () => closures }),
          }),
        },
      },
    },
  } as unknown as PrismaService;

  const config = {
    get: vi.fn().mockReturnValue(options.defaultRule ?? { mode: 'keep' }),
  } as unknown as ConfigService;

  const eventLog = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventLogService;
  const permissions = {
    assertCan: vi.fn().mockResolvedValue(undefined),
  } as unknown as PermissionsService;

  return { service: new RetentionService(prisma, config, eventLog, permissions), permissions };
}

const actor = { userId: 'user-1', isOwner: false };

describe('RetentionService (unit)', () => {
  it('resolves to the room own rule when it is not inherit', async () => {
    const { service } = makeService({
      rooms: { room1: { id: 'room1', retention: { mode: 'keep' }, deletedAt: null } },
    });

    await expect(service.resolveEffectiveRule('room1')).resolves.toEqual({ mode: 'keep' });
  });

  it('falls back to the nearest ancestor space rule when the room inherits', async () => {
    const { service } = makeService({
      rooms: {
        room1: { id: 'room1', retention: { mode: 'inherit' }, deletedAt: null },
        space1: { id: 'space1', retention: { mode: 'hide', after: 3600 }, deletedAt: null },
        space0: { id: 'space0', retention: { mode: 'delete', after: 999 }, deletedAt: null },
      },
      closures: [
        { ancestorId: 'room1', descendantId: 'room1', depth: 0 },
        { ancestorId: 'space1', descendantId: 'room1', depth: 1 },
        { ancestorId: 'space0', descendantId: 'room1', depth: 2 },
      ],
    });

    await expect(service.resolveEffectiveRule('room1')).resolves.toEqual({
      mode: 'hide',
      after: 3600,
    });
  });

  it('skips ancestors that also inherit and keeps walking outward', async () => {
    const { service } = makeService({
      rooms: {
        room1: { id: 'room1', retention: { mode: 'inherit' }, deletedAt: null },
        space1: { id: 'space1', retention: { mode: 'inherit' }, deletedAt: null },
        space0: { id: 'space0', retention: { mode: 'delete', after: 999 }, deletedAt: null },
      },
      closures: [
        { ancestorId: 'room1', descendantId: 'room1', depth: 0 },
        { ancestorId: 'space1', descendantId: 'room1', depth: 1 },
        { ancestorId: 'space0', descendantId: 'room1', depth: 2 },
      ],
    });

    await expect(service.resolveEffectiveRule('room1')).resolves.toEqual({
      mode: 'delete',
      after: 999,
    });
  });

  it('falls back to the server default when no ancestor overrides inherit', async () => {
    const { service } = makeService({
      rooms: { room1: { id: 'room1', retention: { mode: 'inherit' }, deletedAt: null } },
      defaultRule: { mode: 'hide', after: 86_400 },
    });

    await expect(service.resolveEffectiveRule('room1')).resolves.toEqual({
      mode: 'hide',
      after: 86_400,
    });
  });

  it('throws RoomNotFoundError for a missing or soft-deleted room', async () => {
    const { service } = makeService({
      rooms: { room1: { id: 'room1', retention: { mode: 'keep' }, deletedAt: '2024-01-01' } },
    });

    await expect(service.resolveEffectiveRule('room1')).rejects.toThrow(RoomNotFoundError);
    await expect(service.resolveEffectiveRule('missing')).rejects.toThrow(RoomNotFoundError);
  });

  it('getRetention checks room.read and returns both the own and effective rule', async () => {
    const { service, permissions } = makeService({
      rooms: { room1: { id: 'room1', retention: { mode: 'keep' }, deletedAt: null } },
    });

    await expect(service.getRetention(actor, 'room1')).resolves.toEqual({
      rule: { mode: 'keep' },
      effective: { mode: 'keep' },
    });
    expect(permissions.assertCan).toHaveBeenCalledWith(actor, 'room1', 'room.read');
  });
});
