import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { EventLogService } from '../events/event-log.service.js';
import type { MessageRow } from '../messages/message.view.js';
import type { MessagesService } from '../messages/messages.service.js';
import type { RetentionService } from './retention.service.js';
import { RetentionWorkerService } from './retention-worker.service.js';

function messageRow(overrides: Partial<MessageRow> & { id: string }): MessageRow {
  return {
    roomId: 'room1',
    seq: 1n,
    authorId: 'author-1',
    body: 'hello',
    replyToId: null,
    editedAt: null,
    redactedAt: null,
    redactedById: null,
    hiddenAt: null,
    createdAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWorker(options: {
  rooms: Array<{ id: string }>;
  messages: MessageRow[];
  rule: { mode: 'keep' } | { mode: 'hide'; after: number } | { mode: 'delete'; after: number };
}) {
  const roomUpdate = vi.fn().mockResolvedValue(undefined);
  const messageUpdate = vi.fn().mockResolvedValue(undefined);
  const append = vi.fn().mockResolvedValue(undefined);
  const redactMessage = vi.fn().mockResolvedValue(undefined);

  const prisma = {
    orm: {
      public: {
        Room: {
          where: () => ({ limit: () => ({ all: async () => options.rooms }) }),
        },
        Message: {
          where: () => ({ limit: () => ({ all: async () => options.messages }) }),
        },
      },
    },
    transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        orm: {
          public: {
            Message: { where: () => ({ update: messageUpdate }) },
            Room: { where: () => ({ update: roomUpdate }) },
          },
        },
      }),
  } as unknown as PrismaService;

  const config = {
    get: vi.fn().mockReturnValue(900),
  } as unknown as ConfigService;

  const eventLog = { append } as unknown as EventLogService;
  const retention = {
    resolveEffectiveRule: vi.fn().mockResolvedValue(options.rule),
  } as unknown as RetentionService;
  const messages = { redactMessage } as unknown as MessagesService;

  const worker = new RetentionWorkerService(prisma, config, eventLog, retention, messages);

  return { worker, append, redactMessage, messageUpdate };
}

describe('RetentionWorkerService (unit)', () => {
  it('does nothing for a room whose effective rule is keep', async () => {
    const { worker, append, redactMessage } = makeWorker({
      rooms: [{ id: 'room1' }],
      messages: [messageRow({ id: 'm1' })],
      rule: { mode: 'keep' },
    });

    await expect(worker.sweep()).resolves.toBe(0);
    expect(append).not.toHaveBeenCalled();
    expect(redactMessage).not.toHaveBeenCalled();
  });

  it('hides stale messages and emits message_hidden', async () => {
    const { worker, append, messageUpdate } = makeWorker({
      rooms: [{ id: 'room1' }],
      messages: [messageRow({ id: 'm1' }), messageRow({ id: 'm2' })],
      rule: { mode: 'hide', after: 3600 },
    });

    await expect(worker.sweep()).resolves.toBe(2);
    expect(messageUpdate).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        roomId: 'room1',
        type: 'message_hidden',
        senderId: null,
        content: { messageId: 'm1' },
      }),
    );
  });

  it('deletes stale messages via the shared redact core with reason retention', async () => {
    const { worker, redactMessage } = makeWorker({
      rooms: [{ id: 'room1' }],
      messages: [messageRow({ id: 'm1' })],
      rule: { mode: 'delete', after: 3600 },
    });

    await expect(worker.sweep()).resolves.toBe(1);
    expect(redactMessage).toHaveBeenCalledWith(
      'room1',
      expect.objectContaining({ id: 'm1' }),
      null,
      'retention',
    );
  });
});
