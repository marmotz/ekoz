import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RoomPermissionDeniedError } from '../conversations.errors.js';
import type { BanMember } from '../membership/membership.dto.js';
import { MembershipService } from '../membership/membership.service.js';
import { MessagesService } from '../messages/messages.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { ModerationLogEntry } from './moderation-log.view.js';

/** Entries this page returns, most recent first, non-exhaustive (technical.md §17). */
const LOG_PAGE_SIZE = 100;

interface AuditLogRow {
  id: string;
  at: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
}

/**
 * Thin moderation façade (technical.md §17, issue #13) over capabilities
 * already defined elsewhere: delete any message (`room.delete_any`), kick
 * (`room.kick`), ban/unban (`room.ban`). Every action here writes an
 * `audit_log` entry in addition to the `room_event` the delegated service
 * already emits.
 *
 * `audit_log` has a single `(targetType, targetId)` pair per row, so a
 * moderation entry targets the room itself — this is what
 * {@link getModerationLog} filters on directly — and carries the affected
 * user/message id in `metadata` instead.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
    private readonly membership: MembershipService,
    private readonly messages: MessagesService,
  ) {}

  async kick(actor: PermissionPrincipal, roomId: string, userId: string): Promise<void> {
    await this.membership.kick(actor, roomId, userId);
    await this.audit.record({
      action: 'moderation.kick',
      targetType: 'room',
      targetId: roomId,
      metadata: { userId },
    });
  }

  async ban(actor: PermissionPrincipal, roomId: string, input: BanMember): Promise<void> {
    await this.membership.ban(actor, roomId, input);
    await this.audit.record({
      action: 'moderation.ban',
      targetType: 'room',
      targetId: roomId,
      metadata: { userId: input.userId, reason: input.reason ?? null },
    });
  }

  async unban(actor: PermissionPrincipal, roomId: string, userId: string): Promise<void> {
    await this.membership.unban(actor, roomId, userId);
    await this.audit.record({
      action: 'moderation.unban',
      targetType: 'room',
      targetId: roomId,
      metadata: { userId },
    });
  }

  /**
   * Delegates to `MessagesService.deleteMessage`. Only a deletion made under
   * `room.delete_any` is a moderation action — the author deleting their own
   * message via `room.delete_own` is not audited here.
   */
  async deleteMessage(
    actor: PermissionPrincipal,
    roomId: string,
    messageId: string,
  ): Promise<void> {
    const { authorId, viaCapability } = await this.messages.deleteMessage(actor, roomId, messageId);
    if (viaCapability === 'delete_any') {
      await this.audit.record({
        action: 'moderation.delete_message',
        targetType: 'room',
        targetId: roomId,
        metadata: { messageId, authorId },
      });
    }
  }

  /** Room-scoped view over the audit log, for a caller with a moderation capability. */
  async getModerationLog(
    actor: PermissionPrincipal,
    roomId: string,
  ): Promise<ModerationLogEntry[]> {
    await this.assertHasModerationCapability(actor, roomId);

    const rows = (await this.prisma.orm.public.AuditLog.where({
      targetType: 'room',
      targetId: roomId,
    })
      .orderBy((f) => f.at.desc())
      .limit(LOG_PAGE_SIZE)
      .all()) as AuditLogRow[];

    return rows.map((row) => ({
      id: row.id,
      at: row.at,
      actorUserId: row.actorUserId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: isRecord(row.metadata) ? row.metadata : {},
    }));
  }

  private async assertHasModerationCapability(
    actor: PermissionPrincipal,
    roomId: string,
  ): Promise<void> {
    const hasAny =
      (await this.permissions.can(actor, roomId, 'room.kick')) ||
      (await this.permissions.can(actor, roomId, 'room.ban')) ||
      (await this.permissions.can(actor, roomId, 'room.delete_any'));
    if (!hasAny) {
      throw new RoomPermissionDeniedError(
        'You need a moderation capability (kick, ban or delete_any) on this room.',
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
