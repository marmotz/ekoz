import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  EphemeralBroadcaster,
  type PresenceSignal,
} from '../streaming/ephemeral-broadcaster.service.js';
import { PresenceService } from './presence.service.js';
import { InProcessPresenceStore } from './presence.store.js';
import { PresenceSweepService } from './presence-sweep.service.js';

const CONFIG: Record<string, number> = {
  'presence.away_after': 5,
  'presence.offline_after': 15,
  'presence.heartbeat_interval': 45,
  'typing.ttl': 6,
};

describe('PresenceSweepService (unit)', () => {
  let presence: PresenceService;
  let store: InProcessPresenceStore;
  let sweep: PresenceSweepService;
  const received: PresenceSignal[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    received.length = 0;
    store = new InProcessPresenceStore();
    const broadcaster = new EphemeralBroadcaster();
    const config = { get: (key: string) => CONFIG[key] } as unknown as ConfigService;
    const prisma = {
      orm: {
        public: {
          PresencePreference: { where: () => ({ first: async () => null }) },
        },
      },
    } as unknown as PrismaService;
    presence = new PresenceService(store, prisma, config, broadcaster);
    vi.spyOn(presence, 'visiblePeersOf').mockResolvedValue(['peer']);
    broadcaster.onPresence('peer', (signal) => received.push(signal));
    sweep = new PresenceSweepService(presence);
  });

  afterEach(() => {
    sweep.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('emits the lapse to away then offline once each, and drops the user afterwards', async () => {
    await presence.heartbeat('u1', false);

    vi.advanceTimersByTime(6000);
    await sweep.sweep();
    await sweep.sweep();
    expect(received.map((signal) => signal.status)).toEqual(['online', 'away']);

    vi.advanceTimersByTime(10000);
    await sweep.sweep();
    await sweep.sweep();
    expect(received.map((signal) => signal.status)).toEqual(['online', 'away', 'offline']);
    expect(store.userIds()).toEqual([]);
  });

  it('runs on a 5 second timer once the module is initialised', async () => {
    await presence.heartbeat('u1', false);
    sweep.onModuleInit();

    await vi.advanceTimersByTimeAsync(6000);

    expect(received.map((signal) => signal.status)).toEqual(['online', 'away']);
  });

  it('stops the timer on shutdown', async () => {
    await presence.heartbeat('u1', false);
    sweep.onModuleInit();
    sweep.onApplicationShutdown();

    await vi.advanceTimersByTimeAsync(20000);

    expect(received.map((signal) => signal.status)).toEqual(['online']);
  });
});
