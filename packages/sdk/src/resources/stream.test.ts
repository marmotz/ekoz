import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Discovery } from '../discovery/discovery.js';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import {
  createRoomStream,
  type EventSourceLike,
  type EventSourceMessageLike,
  type RoomStream,
} from './stream.js';

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(event: EventSourceMessageLike) => void>>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: EventSourceMessageLike) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  fire(type: string, message: Partial<EventSourceMessageLike> = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: '', lastEventId: '', ...message });
    }
  }
}

const last = () =>
  FakeEventSource.instances[FakeEventSource.instances.length - 1] as FakeEventSource;

const ticketResponse = (ticket: string) => jsonResponse({ body: { ticket, expiresIn: 30 } });

async function setup(...outcomes: Parameters<typeof createFetchMock>) {
  const fetchMock = createFetchMock(...outcomes);
  const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchMock });
  const emitter = new SessionEventEmitter();
  const session = new SessionManager({ httpClient: http, emitter });
  await session.establish({
    accessToken: 'a',
    refreshToken: 'r',
    expiresIn: 900,
    sessionId: 's1',
    identifier: 'alice/example.com',
  });
  const discovery = new Discovery({
    resolveApiUrl: () => 'https://api.example.com/',
    fetch: fetchMock,
  });
  const stream: RoomStream = createRoomStream({
    session,
    discovery,
    emitter,
    eventSource: FakeEventSource,
    random: () => 1,
  });
  return { stream, fetchMock, emitter };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('RoomStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle, mints a ticket and opens the source on connect()', async () => {
    const { stream, fetchMock } = await setup(ticketResponse('t1'));
    const statuses: string[] = [];
    stream.on('status', (status) => statuses.push(status));

    expect(stream.status).toBe('idle');
    stream.connect();
    expect(stream.status).toBe('connecting');
    await flush();

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/stream/ticket');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(last().url).toBe('https://api.example.com/events?ticket=t1');

    last().fire('open');
    expect(stream.status).toBe('open');
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('connect() is idempotent', async () => {
    const { stream, fetchMock } = await setup(ticketResponse('t1'));

    stream.connect();
    stream.connect();
    await flush();
    last().fire('open');
    stream.connect();
    await flush();

    expect(fetchMock.callCount).toBe(1);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('throws when no EventSource implementation is available', async () => {
    const fetchMock = createFetchMock(ticketResponse('t1'));
    const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchMock });
    const emitter = new SessionEventEmitter();
    const stream = createRoomStream({
      session: new SessionManager({ httpClient: http, emitter }),
      discovery: new Discovery({
        resolveApiUrl: () => 'https://api.example.com',
        fetch: fetchMock,
      }),
      emitter,
    });

    expect(() => stream.connect()).toThrow(/EventSource/);
    expect(stream.status).toBe('idle');
  });

  it('parses room_event frames with the roomId and feedSeq', async () => {
    const { stream } = await setup(ticketResponse('t1'));
    const received: unknown[] = [];
    stream.on('room_event', (event) => received.push(event));
    stream.connect();
    await flush();

    const frame = {
      roomId: 'room1',
      type: 'message_created',
      seq: '7',
      senderId: 'u1',
      content: { messageId: 'm1', body: 'hi', replyToId: null, mentions: [] },
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    last().fire('room_event', { data: JSON.stringify(frame), lastEventId: '42' });

    expect(received).toEqual([{ roomId: 'room1', feedSeq: '42', event: frame }]);
  });

  it('dispatches account, presence and typing frames and ignores malformed data', async () => {
    const { stream } = await setup(ticketResponse('t1'));
    const account = vi.fn();
    const presence = vi.fn();
    const typing = vi.fn();
    stream.on('account', account);
    stream.on('presence', presence);
    stream.on('typing', typing);
    stream.connect();
    await flush();

    last().fire('account', {
      data: JSON.stringify({ roomId: 'room1', type: 'invitation_created' }),
      lastEventId: '5',
    });
    last().fire('presence', { data: JSON.stringify({ userId: 'u1', status: 'online' }) });
    last().fire('typing', { data: JSON.stringify({ roomId: 'room1', userId: 'u2', ttl: 5 }) });
    last().fire('presence', { data: 'not json' });

    expect(account).toHaveBeenCalledWith({
      roomId: 'room1',
      type: 'invitation_created',
      feedSeq: '5',
    });
    expect(presence).toHaveBeenCalledTimes(1);
    expect(typing).toHaveBeenCalledWith({ roomId: 'room1', userId: 'u2', ttl: 5 });
  });

  it('closes the source on error and reconnects with a fresh ticket and lastEventId', async () => {
    const { stream, fetchMock } = await setup(ticketResponse('t1'), ticketResponse('t2'));
    const reconnected = vi.fn();
    stream.on('reconnected', reconnected);
    stream.connect();
    await flush();
    const first = last();
    first.fire('open');
    first.fire('room_event', {
      data: JSON.stringify({ roomId: 'room1', type: 'room_deleted', seq: '1', content: {} }),
      lastEventId: '12',
    });
    expect(reconnected).not.toHaveBeenCalled();

    first.fire('error');
    expect(first.closed).toBe(true);
    expect(stream.status).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchMock.callCount).toBe(2);
    expect(last()).not.toBe(first);
    expect(last().url).toBe('https://api.example.com/events?ticket=t2&lastEventId=12');

    last().fire('open');
    expect(stream.status).toBe('open');
    expect(reconnected).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially up to 30 s and resets after open', async () => {
    const { stream, fetchMock } = await setup(() => ticketResponse('t'));
    stream.connect();
    await flush();

    const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
    for (const [index, delay] of delays.entries()) {
      const before = fetchMock.callCount;
      last().fire('error');
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetchMock.callCount, `attempt ${index} too early`).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock.callCount, `attempt ${index} not fired`).toBe(before + 1);
      await flush();
    }

    last().fire('open');
    last().fire('error');
    await vi.advanceTimersByTimeAsync(999);
    const beforeReset = fetchMock.callCount;
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock.callCount).toBe(beforeReset + 1);
  });

  it('applies jitter within half to full delay', async () => {
    const fetchMock = createFetchMock(() => ticketResponse('t'));
    const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchMock });
    const emitter = new SessionEventEmitter();
    const session = new SessionManager({ httpClient: http, emitter });
    await session.establish({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      sessionId: 's1',
      identifier: null,
    });
    const stream = createRoomStream({
      session,
      discovery: new Discovery({
        resolveApiUrl: () => 'https://api.example.com',
        fetch: fetchMock,
      }),
      emitter,
      eventSource: FakeEventSource,
      random: () => 0,
    });
    stream.connect();
    await flush();

    last().fire('error');
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock.callCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock.callCount).toBe(2);
  });

  it('retries when the ticket request fails with a non-authentication error', async () => {
    const { stream, fetchMock } = await setup(
      jsonResponse({ status: 503, body: { type: 'about:blank', title: 'down', status: 503 } }),
      ticketResponse('t2'),
    );
    stream.connect();
    await flush();

    expect(stream.status).toBe('reconnecting');
    expect(FakeEventSource.instances).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchMock.callCount).toBe(2);
    expect(last().url).toBe('https://api.example.com/events?ticket=t2');
  });

  it('stops the loop when the ticket request fails authentication', async () => {
    const { stream, fetchMock } = await setup(
      jsonResponse({
        status: 401,
        body: { type: 'about:blank', title: 'no', status: 401, code: 'auth.forbidden' },
      }),
    );
    stream.connect();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(stream.status).toBe('idle');
    expect(fetchMock.callCount).toBe(1);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('disconnect() closes the source, cancels pending retries and returns to idle', async () => {
    const { stream, fetchMock } = await setup(ticketResponse('t1'));
    stream.connect();
    await flush();
    const source = last();
    source.fire('open');

    stream.disconnect();
    expect(source.closed).toBe(true);
    expect(stream.status).toBe('idle');

    const other = await setup(ticketResponse('t1'));
    other.stream.connect();
    await flush();
    last().fire('error');
    other.stream.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(other.fetchMock.callCount).toBe(1);
    expect(fetchMock.callCount).toBe(1);
  });

  it('disconnect() during ticket minting prevents the source from opening', async () => {
    const { stream } = await setup(ticketResponse('t1'));
    stream.connect();
    stream.disconnect();
    await flush();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(stream.status).toBe('idle');
  });

  it('disconnects on session:invalid', async () => {
    const { stream, emitter } = await setup(ticketResponse('t1'));
    stream.connect();
    await flush();
    last().fire('open');

    emitter.emit('session:invalid', { reason: 'logout' });

    expect(stream.status).toBe('idle');
    expect(last().closed).toBe(true);
  });

  it('fires reconnected on every re-open after the first, and can connect again after disconnect', async () => {
    const { stream } = await setup(() => ticketResponse('t'));
    const reconnected = vi.fn();
    stream.on('reconnected', reconnected);
    stream.connect();
    await flush();
    last().fire('open');

    last().fire('error');
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    last().fire('open');
    last().fire('error');
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    last().fire('open');
    expect(reconnected).toHaveBeenCalledTimes(2);

    stream.disconnect();
    stream.connect();
    await flush();
    last().fire('open');
    expect(reconnected).toHaveBeenCalledTimes(2);
  });
});
