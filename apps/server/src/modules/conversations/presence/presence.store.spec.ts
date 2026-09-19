import { describe, expect, it, vi } from 'vitest';
import { InProcessPresenceStore } from './presence.store.js';

describe('InProcessPresenceStore (unit)', () => {
  it('is offline before any heartbeat', () => {
    const store = new InProcessPresenceStore();
    expect(store.statusOf('u1', 5000, 15000)).toBe('offline');
  });

  it('is online right after a heartbeat, away after the away window, offline after the offline window', () => {
    vi.useFakeTimers();
    try {
      const store = new InProcessPresenceStore();
      store.heartbeat('u1', false);
      expect(store.statusOf('u1', 5000, 15000)).toBe('online');

      vi.advanceTimersByTime(6000);
      expect(store.statusOf('u1', 5000, 15000)).toBe('away');

      vi.advanceTimersByTime(10000);
      expect(store.statusOf('u1', 5000, 15000)).toBe('offline');
    } finally {
      vi.useRealTimers();
    }
  });

  it('an explicit away heartbeat reports away immediately, within the away window', () => {
    const store = new InProcessPresenceStore();
    store.heartbeat('u1', true);
    expect(store.statusOf('u1', 5000, 15000)).toBe('away');
  });
});
