import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { HttpClient } from '../transport/http-client.js';
import { createPresenceResource } from './presence.js';

const heartbeatBody = (over: Record<string, unknown> = {}) => ({
  status: 'online',
  manualAway: false,
  heartbeatInterval: 30,
  typingTtl: 4,
  ...over,
});

async function setup(fetchImpl: typeof fetch) {
  const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchImpl });
  const emitter = new SessionEventEmitter();
  const session = new SessionManager({ httpClient: http, emitter });
  await session.establish({
    accessToken: 'a',
    refreshToken: 'r',
    expiresIn: 900,
    sessionId: 's1',
    identifier: 'alice/example.com',
  });
  return { presence: createPresenceResource(session, emitter), emitter };
}

/** A fetch that answers every heartbeat with `heartbeatBody()` and records the calls. */
function recordingFetch(responses: () => Record<string, unknown> = heartbeatBody) {
  const calls: Array<{ url: string; method?: string; body: unknown }> = [];
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (String(input).endsWith('/typing')) {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(responses()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('presence resource', () => {
  it('heartbeat() hits POST /presence/heartbeat with the body', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: heartbeatBody() }));
    const { presence } = await setup(fetchMock);

    const result = await presence.heartbeat({ away: true, clientId: 'tab' });

    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/presence/heartbeat');
    expect(JSON.parse(String(fetchMock.calls[0]?.init?.body))).toEqual({
      away: true,
      clientId: 'tab',
    });
    expect(result).toEqual(heartbeatBody());
  });

  it('setManualAway() hits PUT /presence/preference', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { status: 'away', manualAway: true } }));
    const { presence } = await setup(fetchMock);

    const result = await presence.setManualAway(true);

    expect(fetchMock.calls[0]?.init?.method).toBe('PUT');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/presence/preference');
    expect(JSON.parse(String(fetchMock.calls[0]?.init?.body))).toEqual({ manualAway: true });
    expect(result).toEqual({ status: 'away', manualAway: true });
  });

  it('typing() hits POST /rooms/:id/typing', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const { presence } = await setup(fetchImpl);

    await presence.typing('r 1');

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://api.example.com/rooms/r%201/typing');
  });
});

describe('presence reporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const heartbeats = (calls: Array<{ url: string; body: unknown }>) =>
    calls.filter((call) => call.url.endsWith('/presence/heartbeat'));

  it('beats immediately on start, then every interval taken from the last response', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const { presence } = await setup(fetchImpl);

    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeats(calls)).toHaveLength(1);

    // The response asked for 30 s, not the 45 s default.
    await vi.advanceTimersByTimeAsync(29_000);
    expect(heartbeats(calls)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(heartbeats(calls)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(heartbeats(calls)).toHaveLength(3);

    presence.reporter.stop();
  });

  it('sends a stable random clientId and the idle flag', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const { presence } = await setup(fetchImpl);

    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);
    presence.reporter.setIdle(true);
    await vi.advanceTimersByTimeAsync(0);

    const bodies = heartbeats(calls).map(
      (call) => call.body as { away: boolean; clientId: string },
    );
    expect(bodies.map((body) => body.away)).toEqual([false, true]);
    expect(bodies[0]?.clientId).toBeTruthy();
    expect(bodies[1]?.clientId).toBe(bodies[0]?.clientId);

    presence.reporter.stop();
  });

  it('beats immediately when idle changes, not when it stays the same', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const { presence } = await setup(fetchImpl);
    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);

    presence.reporter.setIdle(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeats(calls)).toHaveLength(1);

    presence.reporter.setIdle(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeats(calls)).toHaveLength(2);

    // The immediate beat restarts the schedule: only one timer stays armed.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(heartbeats(calls)).toHaveLength(3);

    presence.reporter.stop();
  });

  it('uses the 45 s default until the first response', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    let first = true;
    const fetchImpl = (async (input: string) => {
      calls.push(String(input));
      if (first) {
        first = false;
        await gate;
        throw new Error('network down');
      }
      return new Response(JSON.stringify(heartbeatBody()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const { presence } = await setup(fetchImpl);

    presence.reporter.start();
    release();
    await vi.advanceTimersByTimeAsync(44_000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(2);

    presence.reporter.stop();
  });

  it('exposes state and emits change only when it differs', async () => {
    let status = 'online';
    const { fetchImpl } = recordingFetch(() => heartbeatBody({ status }));
    const { presence } = await setup(fetchImpl);
    const listener = vi.fn();
    presence.reporter.on('change', listener);
    expect(presence.reporter.state).toBeNull();

    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(presence.reporter.state).toEqual({ status: 'online', manualAway: false });
    expect(listener).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(listener).toHaveBeenCalledTimes(1);

    status = 'away';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(presence.reporter.state?.status).toBe('away');
    expect(listener).toHaveBeenCalledTimes(2);

    presence.reporter.stop();
  });

  it('setManualAway() calls the endpoint and updates state', async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    const fetchImpl = (async (input: string, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method });
      return new Response(JSON.stringify({ status: 'away', manualAway: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const { presence } = await setup(fetchImpl);
    const listener = vi.fn();
    presence.reporter.on('change', listener);

    await presence.reporter.setManualAway(true);

    expect(calls[0]).toEqual({
      url: 'https://api.example.com/presence/preference',
      method: 'PUT',
    });
    expect(presence.reporter.state).toEqual({ status: 'away', manualAway: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('retries a failed beat at the next tick', async () => {
    let fail = true;
    const calls: string[] = [];
    const fetchImpl = (async (input: string) => {
      calls.push(String(input));
      if (fail) {
        fail = false;
        throw new Error('network down');
      }
      return new Response(JSON.stringify(heartbeatBody()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const { presence } = await setup(fetchImpl);

    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(presence.reporter.state).toBeNull();

    await vi.advanceTimersByTimeAsync(45_000);
    expect(calls).toHaveLength(2);
    expect(presence.reporter.state?.status).toBe('online');

    presence.reporter.stop();
  });

  it('throttles typing to one POST per room every typingTtl / 2', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const { presence } = await setup(fetchImpl);
    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);
    const typing = () => calls.filter((call) => call.url.endsWith('/typing'));

    // Interval learnt from the response: typingTtl 4 s, so a 2 s window.
    presence.reporter.notifyTyping('r1');
    presence.reporter.notifyTyping('r1');
    presence.reporter.notifyTyping('r2');
    await vi.advanceTimersByTimeAsync(0);
    expect(typing().map((call) => call.url)).toEqual([
      'https://api.example.com/rooms/r1/typing',
      'https://api.example.com/rooms/r2/typing',
    ]);

    await vi.advanceTimersByTimeAsync(1_900);
    presence.reporter.notifyTyping('r1');
    await vi.advanceTimersByTimeAsync(0);
    expect(typing()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(200);
    presence.reporter.notifyTyping('r1');
    await vi.advanceTimersByTimeAsync(0);
    expect(typing()).toHaveLength(3);

    presence.reporter.stop();
  });

  it('swallows typing failures', async () => {
    const fetchImpl = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    const { presence } = await setup(fetchImpl);

    expect(() => presence.reporter.notifyTyping('r1')).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('stop() cancels the schedule', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const { presence } = await setup(fetchImpl);
    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);

    presence.reporter.stop();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(heartbeats(calls)).toHaveLength(1);
  });

  it('stops on session:invalid', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const { presence, emitter } = await setup(fetchImpl);
    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);

    emitter.emit('session:invalid', { reason: 'refresh_failed' });
    await vi.advanceTimersByTimeAsync(120_000);

    expect(heartbeats(calls)).toHaveLength(1);
  });

  it('signOff() stops the loop after a last idle heartbeat', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const { presence } = await setup(fetchImpl);
    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);

    await presence.reporter.signOff();

    const beats = heartbeats(calls).map((call) => call.body as { away: boolean; clientId: string });
    expect(beats).toHaveLength(2);
    expect(beats[1]?.away).toBe(true);
    expect(beats[1]?.clientId).toBe(beats[0]?.clientId);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(heartbeats(calls)).toHaveLength(2);
  });

  it('signOff() resolves when the last heartbeat fails, and does nothing when not started', async () => {
    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const { presence } = await setup(fetchImpl);

    await expect(presence.reporter.signOff()).resolves.toBeUndefined();

    presence.reporter.start();
    await vi.advanceTimersByTimeAsync(0);
    await expect(presence.reporter.signOff()).resolves.toBeUndefined();
  });
});
