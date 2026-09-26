import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { PresenceService } from '../presence/presence.service.js';
import { EphemeralBroadcaster } from './ephemeral-broadcaster.service.js';
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
  const presence = { snapshotFor: vi.fn().mockResolvedValue([]) } as unknown as PresenceService;
  const broadcaster = new EphemeralBroadcaster();
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

  const controller = new EventsController(tickets, feed, presence, broadcaster);
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

describe('EventsController presence and typing subscriptions (unit)', () => {
  const open = async (snapshot: Array<{ userId: string; status: string }> = []) => {
    const feed = {
      since: vi.fn().mockResolvedValue([]),
      head: vi.fn().mockResolvedValue(HEAD),
    } as unknown as FeedReaderService;
    const presence = {
      snapshotFor: vi.fn().mockResolvedValue(snapshot),
    } as unknown as PresenceService;
    const broadcaster = new EphemeralBroadcaster();
    const tickets = { consume: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
    let onClose: () => void = () => undefined;
    const write = vi.fn();
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write,
      end: vi.fn(),
      req: { on: (_event: string, cb: () => void) => (onClose = cb) },
    } as unknown as Response;
    const req = { headers: {}, query: {} } as unknown as Request;

    await new EventsController(tickets, feed, presence, broadcaster).stream('ticket', req, res);

    return { broadcaster, write, close: () => onClose() };
  };

  it('receives the presence and typing signals addressed to its own user only', async () => {
    const { broadcaster, write, close } = await open();

    broadcaster.notifyPresence('user-1', { userId: 'peer', status: 'online' });
    broadcaster.notifyPresence('user-2', { userId: 'peer', status: 'away' });
    broadcaster.notifyTyping('user-1', { roomId: 'r1', userId: 'peer', ttl: 6 });
    broadcaster.notifyTyping('user-2', { roomId: 'r1', userId: 'peer', ttl: 6 });
    close();

    const frames = write.mock.calls.map(([frame]) => frame as string);
    expect(frames).toContain('event: presence\ndata: {"userId":"peer","status":"online"}\n\n');
    expect(frames).toContain('event: typing\ndata: {"roomId":"r1","userId":"peer","ttl":6}\n\n');
    expect(frames.filter((frame) => frame.startsWith('event: presence'))).toHaveLength(1);
    expect(frames.filter((frame) => frame.startsWith('event: typing'))).toHaveLength(1);
  });

  it('releases both subscriptions when the connection closes', async () => {
    const { broadcaster, write, close } = await open();
    close();
    write.mockClear();

    broadcaster.notifyPresence('user-1', { userId: 'peer', status: 'online' });
    broadcaster.notifyTyping('user-1', { roomId: 'r1', userId: 'peer', ttl: 6 });

    expect(write).not.toHaveBeenCalled();
  });

  it('writes one presence frame per snapshot entry when the stream opens', async () => {
    const { write, close } = await open([
      { userId: 'peer-a', status: 'online' },
      { userId: 'peer-b', status: 'away' },
    ]);
    close();

    const frames = write.mock.calls.map(([frame]) => frame as string);
    expect(frames).toContain('event: presence\ndata: {"userId":"peer-a","status":"online"}\n\n');
    expect(frames).toContain('event: presence\ndata: {"userId":"peer-b","status":"away"}\n\n');
  });
});
