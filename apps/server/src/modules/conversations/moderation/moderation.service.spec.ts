import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../../core/audit/audit.service.js';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RoomPermissionDeniedError } from '../conversations.errors.js';
import type { MembershipService } from '../membership/membership.service.js';
import type { MessagesService } from '../messages/messages.service.js';
import type { PermissionsService } from '../permissions/permissions.service.js';
import { ModerationService } from './moderation.service.js';

const actor = { userId: 'user-1', isOwner: false };

function makeService(options: {
  auditLogRows?: unknown[];
  permissions?: Partial<Record<'room.kick' | 'room.ban' | 'room.delete_any', boolean>>;
  deleteMessageResult?: { authorId: string | null; viaCapability: 'delete_own' | 'delete_any' };
}) {
  const record = vi.fn().mockResolvedValue(undefined);
  const kick = vi.fn().mockResolvedValue(undefined);
  const ban = vi.fn().mockResolvedValue(undefined);
  const unban = vi.fn().mockResolvedValue(undefined);
  const deleteMessage = vi
    .fn()
    .mockResolvedValue(
      options.deleteMessageResult ?? { authorId: 'author-1', viaCapability: 'delete_any' },
    );

  const grants = options.permissions ?? {};
  const can = vi.fn(
    async (
      _actor: unknown,
      _roomId: string,
      capability: 'room.kick' | 'room.ban' | 'room.delete_any',
    ) => grants[capability] ?? false,
  );

  const prisma = {
    orm: {
      public: {
        AuditLog: {
          where: () => ({
            orderBy: () => ({ limit: () => ({ all: async () => options.auditLogRows ?? [] }) }),
          }),
        },
      },
    },
  } as unknown as PrismaService;

  const audit = { record } as unknown as AuditService;
  const permissions = { can } as unknown as PermissionsService;
  const membership = { kick, ban, unban } as unknown as MembershipService;
  const messages = { deleteMessage } as unknown as MessagesService;

  return {
    service: new ModerationService(prisma, audit, permissions, membership, messages),
    record,
    kick,
    ban,
    unban,
    deleteMessage,
  };
}

describe('ModerationService (unit)', () => {
  it('kick delegates to MembershipService and audits with a room target', async () => {
    const { service, kick, record } = makeService({});

    await service.kick(actor, 'room1', 'user-2');

    expect(kick).toHaveBeenCalledWith(actor, 'room1', 'user-2');
    expect(record).toHaveBeenCalledWith({
      action: 'moderation.kick',
      targetType: 'room',
      targetId: 'room1',
      metadata: { userId: 'user-2' },
    });
  });

  it('ban delegates and audits with the reason', async () => {
    const { service, ban, record } = makeService({});

    await service.ban(actor, 'room1', { userId: 'user-2', reason: 'spam' });

    expect(ban).toHaveBeenCalledWith(actor, 'room1', { userId: 'user-2', reason: 'spam' });
    expect(record).toHaveBeenCalledWith({
      action: 'moderation.ban',
      targetType: 'room',
      targetId: 'room1',
      metadata: { userId: 'user-2', reason: 'spam' },
    });
  });

  it('unban delegates and audits', async () => {
    const { service, unban, record } = makeService({});

    await service.unban(actor, 'room1', 'user-2');

    expect(unban).toHaveBeenCalledWith(actor, 'room1', 'user-2');
    expect(record).toHaveBeenCalledWith({
      action: 'moderation.unban',
      targetType: 'room',
      targetId: 'room1',
      metadata: { userId: 'user-2' },
    });
  });

  it('deleteMessage audits when the deletion went through room.delete_any', async () => {
    const { service, deleteMessage, record } = makeService({
      deleteMessageResult: { authorId: 'author-1', viaCapability: 'delete_any' },
    });

    await service.deleteMessage(actor, 'room1', 'msg1');

    expect(deleteMessage).toHaveBeenCalledWith(actor, 'room1', 'msg1');
    expect(record).toHaveBeenCalledWith({
      action: 'moderation.delete_message',
      targetType: 'room',
      targetId: 'room1',
      metadata: { messageId: 'msg1', authorId: 'author-1' },
    });
  });

  it('deleteMessage does not audit a self-delete via room.delete_own', async () => {
    const { service, record } = makeService({
      deleteMessageResult: { authorId: 'user-1', viaCapability: 'delete_own' },
    });

    await service.deleteMessage(actor, 'room1', 'msg1');

    expect(record).not.toHaveBeenCalled();
  });

  it('getModerationLog requires a moderation capability', async () => {
    const { service } = makeService({ permissions: {} });

    await expect(service.getModerationLog(actor, 'room1')).rejects.toThrow(
      RoomPermissionDeniedError,
    );
  });

  it('getModerationLog succeeds with any one of kick/ban/delete_any', async () => {
    const { service } = makeService({
      permissions: { 'room.kick': true },
      auditLogRows: [
        {
          id: 'log1',
          at: '2024-01-01T00:00:00.000Z',
          actorUserId: 'user-1',
          action: 'moderation.kick',
          targetType: 'room',
          targetId: 'room1',
          metadata: { userId: 'user-2' },
        },
      ],
    });

    await expect(service.getModerationLog(actor, 'room1')).resolves.toEqual([
      {
        id: 'log1',
        at: '2024-01-01T00:00:00.000Z',
        actorUserId: 'user-1',
        action: 'moderation.kick',
        targetType: 'room',
        targetId: 'room1',
        metadata: { userId: 'user-2' },
      },
    ]);
  });
});
