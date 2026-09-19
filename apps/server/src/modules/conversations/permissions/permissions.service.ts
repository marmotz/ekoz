import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { RoomNotFoundError, RoomPermissionDeniedError } from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import { CAPABILITIES, type Capability } from './capabilities.js';
import type { RoomRole } from './role-default-capabilities.js';

export interface PermissionPrincipal {
  userId: string;
  isOwner: boolean;
}

interface OverrideRow {
  nodeId: string;
  capability: string;
  effect: 'allow' | 'deny';
}

/**
 * Capability resolver (technical.md §6, permission-model.md, issues #3-#4).
 *
 * Effective role, in order: explicit `Membership` on the room; else the role
 * from the nearest ancestor space `Membership` (via `RoomClosure`, smallest
 * depth wins); else the room's `defaultRole` if the user may join (a
 * `public` room, or a pending `RoomInvitation`); else no access.
 */
@Injectable()
export class PermissionsService {
  /** `${roomId}` -> `${userId}:${capability}` -> decision. */
  private readonly cache = new Map<string, Map<string, boolean>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
  ) {}

  async can(
    principal: PermissionPrincipal,
    roomId: string,
    capability: Capability,
  ): Promise<boolean> {
    if (principal.isOwner) {
      return true;
    }

    const cacheKey = `${principal.userId}:${capability}`;
    const roomCache = this.cache.get(roomId);
    const cached = roomCache?.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const decision = await this.resolve(principal, roomId, capability);
    const bucket = roomCache ?? new Map<string, boolean>();
    bucket.set(cacheKey, decision);
    this.cache.set(roomId, bucket);

    return decision;
  }

  /** Every capability `principal` effectively holds on `roomId` — client UI gating. */
  async myPermissions(principal: PermissionPrincipal, roomId: string): Promise<Capability[]> {
    const results = await Promise.all(
      CAPABILITIES.map(
        async (capability) => [capability, await this.can(principal, roomId, capability)] as const,
      ),
    );

    return results.filter(([, allowed]) => allowed).map(([capability]) => capability);
  }

  /**
   * Set a role-scoped override on `nodeId` (needs `room.manage_permissions` on
   * it), emitting `permission_override_changed`.
   */
  async setRoleOverride(
    actor: PermissionPrincipal,
    nodeId: string,
    role: RoomRole,
    capability: Capability,
    effect: 'allow' | 'deny',
  ): Promise<void> {
    await this.assertCan(actor, nodeId, 'room.manage_permissions');

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomPermissionOverride.where({ nodeId, role, capability }).upsert({
        create: { nodeId, role, capability, effect },
        update: { effect },
      });
      await this.eventLog.append(tx, {
        roomId: nodeId,
        type: 'permission_override_changed',
        senderId: actor.userId,
        content: { scope: 'role', role, capability, effect },
      });
    });

    await this.invalidateSubtree(nodeId);
  }

  /**
   * Set a per-user override on `nodeId` (needs `room.manage_permissions` on
   * it), emitting `permission_override_changed`.
   */
  async setMemberOverride(
    actor: PermissionPrincipal,
    nodeId: string,
    userId: string,
    capability: Capability,
    effect: 'allow' | 'deny',
  ): Promise<void> {
    await this.assertCan(actor, nodeId, 'room.manage_permissions');

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomMemberPermission.where({ nodeId, userId, capability }).upsert({
        create: { nodeId, userId, capability, effect },
        update: { effect },
      });
      await this.eventLog.append(tx, {
        roomId: nodeId,
        type: 'permission_override_changed',
        senderId: actor.userId,
        content: { scope: 'user', userId, capability, effect },
      });
    });

    await this.invalidateSubtree(nodeId);
  }

  async assertCan(
    principal: PermissionPrincipal,
    roomId: string,
    capability: Capability,
  ): Promise<void> {
    if (!(await this.can(principal, roomId, capability))) {
      throw new RoomPermissionDeniedError(`Missing capability "${capability}" on this room.`);
    }
  }

  /** Drop every cached decision for `roomId` (technical.md §6: invalidated on any change touching the subtree). */
  invalidateRoom(roomId: string): void {
    this.cache.delete(roomId);
  }

  /** Drop cached decisions for `nodeId` and every descendant. */
  async invalidateSubtree(nodeId: string): Promise<void> {
    const rows = (await this.prisma.orm.public.RoomClosure.where({
      ancestorId: nodeId,
    }).all()) as Array<{
      descendantId: string;
    }>;
    for (const row of rows) {
      this.invalidateRoom(row.descendantId);
    }
  }

  /** Effective role for `principal` on `roomId`, per the resolution order above; `null` = no access. */
  async effectiveRole(principal: PermissionPrincipal, roomId: string): Promise<RoomRole | null> {
    const room = (await this.prisma.orm.public.Room.where({ id: roomId }).first()) as {
      id: string;
      visibility: string;
      defaultRole: RoomRole;
    } | null;
    if (!room) {
      throw new RoomNotFoundError();
    }

    return this.resolveRole(principal, room, roomId);
  }

  private async resolveRole(
    principal: PermissionPrincipal,
    room: { visibility: string; defaultRole: RoomRole },
    roomId: string,
  ): Promise<RoomRole | null> {
    const ownMembership = (await this.prisma.orm.public.Membership.where({
      roomId,
      userId: principal.userId,
    }).first()) as { role: RoomRole } | null;
    if (ownMembership) {
      return ownMembership.role;
    }

    // Ancestor spaces, nearest first (smallest depth, excluding the self row).
    const ancestorRows = (await this.prisma.orm.public.RoomClosure.where((f) =>
      and(f.descendantId.eq(roomId), f.depth.gt(0)),
    )
      .orderBy((f) => f.depth.asc())
      .all()) as Array<{ ancestorId: string; depth: number }>;
    if (ancestorRows.length > 0) {
      const ancestorMemberships = (await this.prisma.orm.public.Membership.where((f) =>
        and(f.roomId.in(ancestorRows.map((r) => r.ancestorId)), f.userId.eq(principal.userId)),
      ).all()) as Array<{ roomId: string; role: RoomRole }>;
      const byRoomId = new Map(ancestorMemberships.map((m) => [m.roomId, m.role]));
      for (const ancestor of ancestorRows) {
        const role = byRoomId.get(ancestor.ancestorId);
        if (role) {
          return role;
        }
      }
    }

    if (room.visibility === 'public') {
      return room.defaultRole;
    }

    const pendingInvitation = (await this.prisma.orm.public.RoomInvitation.where((f) =>
      and(
        f.roomId.eq(roomId),
        f.userId.eq(principal.userId),
        f.acceptedAt.isNull(),
        f.declinedAt.isNull(),
      ),
    ).first()) as unknown;
    if (pendingInvitation) {
      return room.defaultRole;
    }

    return null;
  }

  private async resolve(
    principal: PermissionPrincipal,
    roomId: string,
    capability: Capability,
  ): Promise<boolean> {
    const room = (await this.prisma.orm.public.Room.where({ id: roomId }).first()) as {
      id: string;
      visibility: string;
      defaultRole: RoomRole;
    } | null;
    if (!room) {
      throw new RoomNotFoundError();
    }

    const role = await this.resolveRole(principal, room, roomId);
    if (!role) {
      return false;
    }

    const defaultGrant = (await this.prisma.orm.public.RoleDefaultCapability.where({
      role,
      capability,
    }).first()) as { effect: 'allow' | 'deny' } | null;
    let decision = defaultGrant?.effect === 'allow';

    // Ancestor chain, root -> room (largest depth = furthest ancestor, 0 = self).
    const ancestorRows = (await this.prisma.orm.public.RoomClosure.where((f) =>
      f.descendantId.eq(roomId),
    )
      .orderBy((f) => f.depth.desc())
      .all()) as Array<{ ancestorId: string; depth: number }>;
    const ancestorIds = ancestorRows.map((r) => r.ancestorId);
    if (ancestorIds.length === 0) {
      ancestorIds.push(roomId);
    }

    const roleOverrides = (await this.prisma.orm.public.RoomPermissionOverride.where((f) =>
      and(f.nodeId.in(ancestorIds), f.role.eq(role), f.capability.eq(capability)),
    ).all()) as OverrideRow[];
    const memberOverrides = (await this.prisma.orm.public.RoomMemberPermission.where((f) =>
      and(f.nodeId.in(ancestorIds), f.userId.eq(principal.userId), f.capability.eq(capability)),
    ).all()) as OverrideRow[];

    const byNode = new Map<string, boolean>();
    for (const row of roleOverrides) {
      byNode.set(row.nodeId, row.effect === 'allow');
    }
    for (const row of memberOverrides) {
      byNode.set(row.nodeId, row.effect === 'allow');
    }

    for (const nodeId of ancestorIds) {
      const override = byNode.get(nodeId);
      if (override !== undefined) {
        decision = override;
      }
    }

    return decision;
  }
}
