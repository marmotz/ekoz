import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  EphemeralBroadcaster,
  type PresenceSignal,
} from '../streaming/ephemeral-broadcaster.service.js';
import { PresenceService } from './presence.service.js';
import { InProcessPresenceStore } from './presence.store.js';

const CONFIG: Record<string, number> = {
  'presence.away_after': 5,
  'presence.offline_after': 15,
  'presence.heartbeat_interval': 45,
  'typing.ttl': 6,
};

function setup(manualAwayRow: { manualAway: boolean } | null = null) {
  const store = new InProcessPresenceStore();
  const broadcaster = new EphemeralBroadcaster();
  const config = { get: (key: string) => CONFIG[key] } as unknown as ConfigService;
  const upsert = vi.fn().mockResolvedValue({});
  const prisma = {
    orm: {
      public: {
        PresencePreference: {
          where: () => ({ first: async () => manualAwayRow, upsert }),
        },
      },
    },
  } as unknown as PrismaService;
  const service = new PresenceService(store, prisma, config, broadcaster);
  vi.spyOn(service, 'visiblePeersOf').mockImplementation(async (userId) =>
    userId === 'u1' ? ['peer'] : [],
  );
  const received: PresenceSignal[] = [];
  broadcaster.onPresence('peer', (signal) => received.push(signal));

  return { service, received, upsert };
}

describe('PresenceService (unit)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits to visible peers only on a status change, not on every heartbeat', async () => {
    const { service, received } = setup();

    await service.heartbeat('u1', false);
    await service.heartbeat('u1', false);
    await service.heartbeat('u1', false);
    expect(received).toEqual([{ userId: 'u1', status: 'online' }]);

    await service.heartbeat('u1', true);
    expect(received).toEqual([
      { userId: 'u1', status: 'online' },
      { userId: 'u1', status: 'away' },
    ]);
  });

  it('returns the status, manual away and the client timing settings', async () => {
    const { service } = setup({ manualAway: true });

    const response = await service.heartbeat('u1', false);

    expect(response).toEqual({
      status: 'away',
      manualAway: true,
      heartbeatInterval: 45,
      typingTtl: 6,
    });
  });

  it('loads the manual away preference once, on the first heartbeat', async () => {
    const { service, received } = setup({ manualAway: true });

    await service.heartbeat('u1', false);

    expect(received).toEqual([{ userId: 'u1', status: 'away' }]);
  });

  it('manual away wins over an active client and emits on each toggle', async () => {
    const { service, received, upsert } = setup();
    await service.heartbeat('u1', false);

    expect(await service.setManualAway('u1', true)).toEqual({ status: 'away', manualAway: true });
    expect(await service.setManualAway('u1', false)).toEqual({
      status: 'online',
      manualAway: false,
    });

    expect(received.map((signal) => signal.status)).toEqual(['online', 'away', 'online']);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('emits nothing when toggling manual away while offline', async () => {
    const { service, received } = setup();

    expect(await service.setManualAway('u1', true)).toEqual({
      status: 'offline',
      manualAway: true,
    });

    expect(received).toEqual([]);
  });

  it('publish emits the lapse to away then offline once each', async () => {
    const { service, received } = setup();
    await service.heartbeat('u1', false);

    vi.advanceTimersByTime(6000);
    await service.publish('u1');
    await service.publish('u1');
    vi.advanceTimersByTime(10000);
    await service.publish('u1');
    await service.publish('u1');

    expect(received.map((signal) => signal.status)).toEqual(['online', 'away', 'offline']);
  });

  it('the snapshot lists visible peers that are not offline', async () => {
    const { service } = setup();
    vi.spyOn(service, 'visiblePeersOf').mockResolvedValue(['on', 'away', 'off']);
    await service.heartbeat('on', false);
    await service.heartbeat('away', true);

    expect(await service.snapshotFor('me')).toEqual([
      { userId: 'on', status: 'online' },
      { userId: 'away', status: 'away' },
    ]);
  });
});
