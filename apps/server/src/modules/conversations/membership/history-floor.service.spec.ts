import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import { MessageNotFoundError } from '../conversations.errors.js';
import { HistoryFloorService } from './history-floor.service.js';

function serviceWith(row: { historyFromSeq: bigint | null } | null): HistoryFloorService {
  const first = vi.fn().mockResolvedValue(row);
  const prisma = {
    orm: { public: { Membership: { where: vi.fn().mockReturnValue({ first }) } } },
  } as unknown as PrismaService;

  return new HistoryFloorService(prisma);
}

describe('HistoryFloorService', () => {
  it('returns the stored floor', async () => {
    expect(await serviceWith({ historyFromSeq: 5n }).floorFor('r', 'u')).toBe(5n);
  });

  it('returns null without a floor', async () => {
    expect(await serviceWith({ historyFromSeq: null }).floorFor('r', 'u')).toBeNull();
  });

  it('returns null without an explicit membership', async () => {
    expect(await serviceWith(null).floorFor('r', 'u')).toBeNull();
  });

  it('hides a message below the floor and shows one at or above it', async () => {
    const service = serviceWith({ historyFromSeq: 5n });

    await expect(service.assertVisible('r', 'u', 4n)).rejects.toBeInstanceOf(MessageNotFoundError);
    await expect(service.assertVisible('r', 'u', 5n)).resolves.toBeUndefined();
  });

  it('shows every message without a floor', async () => {
    await expect(serviceWith(null).assertVisible('r', 'u', 1n)).resolves.toBeUndefined();
  });
});
