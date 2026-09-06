import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import { InProcessStreamTicketStore } from './stream-ticket.store.js';
import { TicketService } from './ticket.service.js';

function makeService(ttlSeconds = 30): {
  service: TicketService;
  store: InProcessStreamTicketStore;
} {
  const store = new InProcessStreamTicketStore();
  const config = { get: () => ttlSeconds } as unknown as ConfigService;

  return { service: new TicketService(store, config), store };
}

describe('TicketService (unit)', () => {
  it('issues an opaque ticket and reports the configured TTL', async () => {
    const { service } = makeService(30);
    const { ticket, expiresIn } = await service.issue({ userId: 'u1', sessionId: 's1' });

    expect(ticket).toMatch(/^[\w-]{40,}$/);
    expect(expiresIn).toBe(30);
  });

  it('consumes a ticket exactly once, returning its binding', async () => {
    const { service } = makeService();
    const { ticket } = await service.issue({ userId: 'u1', sessionId: 's1' });

    expect(await service.consume(ticket)).toEqual({ userId: 'u1', sessionId: 's1' });
    expect(await service.consume(ticket)).toBeNull();
  });

  it('rejects an unknown ticket', async () => {
    const { service } = makeService();
    expect(await service.consume('nope')).toBeNull();
  });

  it('rejects a ticket past its TTL', async () => {
    vi.useFakeTimers();
    try {
      const { service } = makeService(30);
      const { ticket } = await service.issue({ userId: 'u1', sessionId: 's1' });
      vi.advanceTimersByTime(31_000);
      expect(await service.consume(ticket)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sweeps expired entries on the next issue, keeping the store bounded', async () => {
    vi.useFakeTimers();
    try {
      const { service, store } = makeService(30);
      await service.issue({ userId: 'u1', sessionId: 's1' });
      expect(store.size).toBe(1);

      vi.advanceTimersByTime(31_000);
      await service.issue({ userId: 'u2', sessionId: 's2' });
      expect(store.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stores only the ticket hash, never the plaintext', async () => {
    const { service, store } = makeService();
    const { ticket } = await service.issue({ userId: 'u1', sessionId: 's1' });

    expect(await store.take(ticket)).toBeNull();
  });
});
