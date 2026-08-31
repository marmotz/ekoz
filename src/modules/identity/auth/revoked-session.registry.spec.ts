import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RevokedSessionRegistry } from './revoked-session.registry.js';

function makeRegistry(ttlSeconds: number): RevokedSessionRegistry {
  const config = { get: () => ttlSeconds } as unknown as ConfigService;

  return new RevokedSessionRegistry({} as unknown as PrismaService, config);
}

describe('RevokedSessionRegistry (unit)', () => {
  it('reports a revoked sid until the retention window elapses', () => {
    const registry = makeRegistry(900);
    expect(registry.isRevoked('s1')).toBe(false);

    registry.revoke('s1');
    expect(registry.isRevoked('s1')).toBe(true);
  });

  it('drops an entry once its window is past', () => {
    vi.useFakeTimers();
    try {
      const registry = makeRegistry(1);
      registry.revoke('s1');
      vi.advanceTimersByTime(2_000);
      expect(registry.isRevoked('s1')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
