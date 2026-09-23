import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { PresenceService } from '../presence/presence.service.js';
import type { EphemeralBroadcaster } from './ephemeral-broadcaster.service.js';
import { EventsController } from './events.controller.js';
import type { FeedReaderService } from './feed-reader.service.js';

const HEAD = 42n;

/** Opens the stream once and returns the cursor `FeedReaderService.since` was first called with. */
async function firstCursor(options: {
  header?: string;
  query?: string;
}): Promise<{ cursor: bigint; head: ReturnType<typeof vi.fn> }> {
  const since = vi.fn().mockResolvedValue([]);
  const head = vi.fn().mockResolvedValue(HEAD);
  const feed = { since, head } as unknown as FeedReaderService;
  const presence = { visiblePeersOf: vi.fn().mockResolvedValue([]) } as unknown as PresenceService;
  const broadcaster = {} as unknown as EphemeralBroadcaster;
  const prisma = {
    orm: { public: { Membership: { where: () => ({ all: async () => [] }) } } },
  } as unknown as PrismaService;
  const tickets = { consume: vi.fn().mockResolvedValue({ userId: 'user-1' }) };

  let onClose: () => void = () => undefined;
  const res = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    req: { on: (_event: string, cb: () => void) => (onClose = cb) },
  } as unknown as Response;
  const req = {
    headers: options.header === undefined ? {} : { 'last-event-id': options.header },
    query: options.query === undefined ? {} : { lastEventId: options.query },
  } as unknown as Request;

  const controller = new EventsController(tickets, feed, presence, broadcaster, prisma);
  await controller.stream('ticket', req, res);
  onClose();

  return { cursor: since.mock.calls[0]?.[1] as bigint, head };
}

describe('EventsController stream start position (unit)', () => {
  it('starts at the feed head when no cursor is given', async () => {
    const { cursor, head } = await firstCursor({});

    expect(head).toHaveBeenCalledWith('user-1');
    expect(cursor).toBe(HEAD);
  });

  it('replays from Last-Event-ID without reading the head', async () => {
    const { cursor, head } = await firstCursor({ header: '7' });

    expect(cursor).toBe(7n);
    expect(head).not.toHaveBeenCalled();
  });

  it('replays from ?lastEventId= when the header is absent', async () => {
    const { cursor, head } = await firstCursor({ query: '9' });

    expect(cursor).toBe(9n);
    expect(head).not.toHaveBeenCalled();
  });

  it('treats a malformed cursor as no cursor', async () => {
    const { cursor } = await firstCursor({ header: 'not-a-number' });

    expect(cursor).toBe(HEAD);
  });

  it('keeps an explicit cursor of 0', async () => {
    const { cursor, head } = await firstCursor({ header: '0' });

    expect(cursor).toBe(0n);
    expect(head).not.toHaveBeenCalled();
  });
});
