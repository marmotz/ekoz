import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../../core/config/config.service.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { EventLogService } from './events/event-log.service.js';

/**
 * Per-room event log and seq allocation (issue #2), end to end against a real
 * database: `seq` stays monotonic and gap-free under concurrent appends to the
 * same room (technical.md §10, item 6).
 */
describe('conversations — event log (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let prisma: PrismaService;
  let eventLog: EventLogService;
  let config: ConfigService;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    prisma = app.get(PrismaService);
    eventLog = app.get(EventLogService);
    config = app.get(ConfigService);
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  const createTestRoom = async (): Promise<{ id: string }> =>
    (await prisma.orm.public.Room.create({
      type: 'space',
      visibility: 'private',
      defaultRole: 'member',
      readOnly: false,
      originServer: 'test.example',
      lastSeq: 0n,
      retention: { mode: 'inherit' },
      updatedAt: new Date().toISOString(),
    })) as { id: string };

  const appendOne = (roomId: string) =>
    prisma.transaction(async (tx) => {
      const event = await eventLog.append(tx, {
        roomId,
        type: 'room_updated',
        senderId: null,
        content: {},
      });

      return event.seq;
    });

  it('allocates a gap-free, monotonic seq under concurrent appends to the same room', async () => {
    const room = await createTestRoom();

    const seqs = await Promise.all(Array.from({ length: 8 }, () => appendOne(room.id)));
    const sorted = [...seqs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    expect(new Set(sorted.map(String)).size).toBe(8);
    expect(sorted.every((v, i) => v === BigInt(i + 1))).toBe(true);

    const persisted = (await prisma.orm.public.RoomEvent.where((f) =>
      f.roomId.eq(room.id),
    ).all()) as unknown[];
    expect(persisted).toHaveLength(8);
  });

  it('property: seq is always a gap-free permutation of 1..n under any concurrency, for any n', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 6 }), async (concurrency) => {
        const room = await createTestRoom();

        const seqs = await Promise.all(
          Array.from({ length: concurrency }, () => appendOne(room.id)),
        );
        const sorted = [...seqs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

        return (
          new Set(sorted.map(String)).size === concurrency &&
          sorted.every((v, i) => v === BigInt(i + 1))
        );
      }),
      { numRuns: 8 },
    );
  });

  it('stamps every appended event with the server domain as originServer', async () => {
    const room = await createTestRoom();

    const event = await prisma.transaction((tx) =>
      eventLog.append(tx, { roomId: room.id, type: 'room_updated', senderId: null, content: {} }),
    );

    expect(event.originServer).toBe(config.get('server.domain'));

    const persisted = (await prisma.orm.public.RoomEvent.where((f) =>
      f.roomId.eq(room.id),
    ).first()) as {
      originServer: string;
    } | null;
    expect(persisted?.originServer).toBe(config.get('server.domain'));
  });

  it('rejects an event whose content does not match its type schema', async () => {
    const room = (await prisma.orm.public.Room.create({
      type: 'space',
      visibility: 'private',
      defaultRole: 'member',
      readOnly: false,
      originServer: 'test.example',
      lastSeq: 0n,
      retention: { mode: 'inherit' },
      updatedAt: new Date().toISOString(),
    })) as { id: string };

    await expect(
      prisma.transaction((tx) =>
        eventLog.append(tx, {
          roomId: room.id,
          type: 'room_created',
          senderId: null,
          // Missing every required field of the `room_created` payload.
          content: {} as never,
        }),
      ),
    ).rejects.toThrow();
  });
});
