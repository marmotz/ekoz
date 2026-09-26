import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RoomPermissionDeniedError } from '../conversations.errors.js';
import type { EventLogService, RoomTx } from '../events/event-log.service.js';
import { PermissionsService } from './permissions.service.js';

function setup() {
  const first = vi.fn().mockResolvedValue(null);
  const update = vi.fn().mockResolvedValue({});
  const create = vi.fn().mockResolvedValue({});
  const where = vi.fn().mockReturnValue({ first, update });
  const tx = {
    orm: { public: { RoomMemberPermission: { where, create } } },
  } as unknown as RoomTx;
  const prisma = {
    transaction: vi.fn(async (fn: (t: RoomTx) => Promise<unknown>) => fn(tx)),
    orm: { public: { RoomClosure: { where: vi.fn().mockReturnValue({ all: async () => [] }) } } },
  } as unknown as PrismaService;
  const append = vi.fn().mockResolvedValue({});
  const service = new PermissionsService(prisma, { append } as unknown as EventLogService);

  return { service, tx, first, update, create, where, append, prisma };
}

describe('PermissionsService member overrides', () => {
  it('writeMemberOverride creates a missing override and appends the event, with no capability check', async () => {
    const { service, tx, create, update, where, append } = setup();
    const assertCan = vi.spyOn(service, 'assertCan');

    await service.writeMemberOverride(tx, 'actor', 'room', 'user', 'room.manage_members', 'allow');

    expect(where).toHaveBeenCalledWith({
      nodeId: 'room',
      userId: 'user',
      capability: 'room.manage_members',
    });
    expect(create).toHaveBeenCalledWith({
      nodeId: 'room',
      userId: 'user',
      capability: 'room.manage_members',
      effect: 'allow',
    });
    expect(update).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(tx, {
      roomId: 'room',
      type: 'permission_override_changed',
      senderId: 'actor',
      content: {
        scope: 'user',
        userId: 'user',
        capability: 'room.manage_members',
        effect: 'allow',
      },
    });
    expect(assertCan).not.toHaveBeenCalled();
  });

  it('writeMemberOverride updates an existing override in place', async () => {
    const { service, tx, first, create, update, where } = setup();
    first.mockResolvedValue({ id: 'override-1' });

    await service.writeMemberOverride(tx, 'actor', 'room', 'user', 'room.manage_members', 'deny');

    expect(where).toHaveBeenLastCalledWith({ id: 'override-1' });
    expect(update).toHaveBeenCalledWith({ effect: 'deny' });
    expect(create).not.toHaveBeenCalled();
  });

  it('setMemberOverride checks room.manage_permissions then delegates to the write', async () => {
    const { service, append } = setup();
    const assertCan = vi.spyOn(service, 'assertCan').mockResolvedValue();

    await service.setMemberOverride(
      { userId: 'actor', isOwner: false },
      'room',
      'user',
      'room.post',
      'deny',
    );

    expect(assertCan).toHaveBeenCalledWith(
      { userId: 'actor', isOwner: false },
      'room',
      'room.manage_permissions',
    );
    expect(append).toHaveBeenCalledOnce();
  });

  it('setMemberOverride writes nothing when the capability check fails', async () => {
    const { service, create, update, append } = setup();
    vi.spyOn(service, 'assertCan').mockRejectedValue(new RoomPermissionDeniedError());

    await expect(
      service.setMemberOverride(
        { userId: 'actor', isOwner: false },
        'room',
        'user',
        'room.post',
        'deny',
      ),
    ).rejects.toBeInstanceOf(RoomPermissionDeniedError);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });
});
