import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
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
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('allocates a gap-free, monotonic seq under concurrent appends to the same room', async () => {
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

    const appendOne = () =>
      prisma.transaction(async (tx) => {
        const event = await eventLog.append(tx, {
          roomId: room.id,
          type: 'room_updated',
          senderId: null,
          content: {},
        });

        return event.seq;
      });

    const seqs = await Promise.all(Array.from({ length: 8 }, appendOne));
    const sorted = [...seqs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    expect(new Set(sorted.map(String)).size).toBe(8);
    expect(sorted.every((v, i) => v === BigInt(i + 1))).toBe(true);

    const persisted = (await prisma.orm.public.RoomEvent.where((f) =>
      f.roomId.eq(room.id),
    ).all()) as unknown[];
    expect(persisted).toHaveLength(8);
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
