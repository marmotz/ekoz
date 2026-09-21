import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { UserSummaryReader } from '../../../core/users/user-summary.reader.js';
import {
  InvitationAlreadyExistsError,
  InvitationAlreadyResolvedError,
  InvitationNotFoundError,
  JoinRequestAlreadyExistsError,
  JoinRequestAlreadyResolvedError,
  JoinRequestNotFoundError,
  MembershipNotFoundError,
  RoleAboveAuthorityError,
  RoomAlreadyMemberError,
  RoomBannedError,
  RoomNotFoundError,
  RoomNotJoinableError,
} from '../conversations.errors.js';
import { EventLogService } from '../events/event-log.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { ROLE_RANK, type RoomRole } from '../permissions/role-default-capabilities.js';
import type { RoomRow } from '../rooms/room.view.js';
import { FeedFanoutService } from '../streaming/feed-fanout.service.js';
import type { BanMember, InviteMember } from './membership.dto.js';
import {
  type JoinRequestRow,
  type JoinRequestView,
  type MembershipRow,
  type MembershipView,
  type MyRoomInvitationListView,
  type RoomInvitationRow,
  type RoomInvitationView,
  toJoinRequestView,
  toMembershipView,
  toRoomInvitationView,
} from './membership.view.js';

type InvitedRoomRow = Pick<RoomRow, 'id' | 'type' | 'name' | 'topic' | 'visibility'>;

interface RoomLookup {
  id: string;
  type: string;
  visibility: string;
  defaultRole: RoomRole;
}

/** Membership lifecycle: join/leave, invitations, join requests, kick, ban/unban, role change (technical.md §9, issue #4). */
@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly permissions: PermissionsService,
    private readonly feedFanout: FeedFanoutService,
    private readonly userSummaries: UserSummaryReader,
  ) {}

  async join(actor: PermissionPrincipal, roomId: string): Promise<MembershipView> {
    const room = await this.findRoomOrThrow(roomId);
    if (room.visibility !== 'public') {
      throw new RoomNotJoinableError();
    }
    await this.assertNotBanned(roomId, actor.userId);
    await this.assertNotMember(roomId, actor.userId);

    const membership = await this.prisma.transaction(async (tx) => {
      const row = (await tx.orm.public.Membership.create({
        roomId,
        userId: actor.userId,
        role: room.defaultRole,
        invitedById: null,
      })) as MembershipRow;

      await this.eventLog.append(tx, {
        roomId,
        type: 'member_joined',
        senderId: actor.userId,
        content: { userId: actor.userId, role: room.defaultRole },
      });

      return row;
    });

    await this.permissions.invalidateSubtree(roomId);

    return toMembershipView(membership);
  }

  async leave(actor: PermissionPrincipal, roomId: string): Promise<void> {
    const room = await this.findRoomOrThrow(roomId);
    await this.requireMembership(roomId, actor.userId);

    // A `dm`'s membership is fixed (technical.md §7): "leaving" hides/archives
    // it for this user instead of removing the row, and emits no room event —
    // the other participant's membership is untouched.
    if (room.type === 'dm') {
      await this.prisma.orm.public.Membership.where({ roomId, userId: actor.userId }).update({
        hiddenAt: new Date().toISOString(),
      });
      return;
    }

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.Membership.where({ roomId, userId: actor.userId }).delete();
      await this.eventLog.append(tx, {
        roomId,
        type: 'member_left',
        senderId: actor.userId,
        content: { userId: actor.userId },
      });
    });

    await this.permissions.invalidateSubtree(roomId);
  }

  async invite(
    actor: PermissionPrincipal,
    roomId: string,
    input: InviteMember,
  ): Promise<RoomInvitationView> {
    await this.findRoomOrThrow(roomId);
    await this.permissions.assertCan(actor, roomId, 'room.invite');

    const existing = (await this.prisma.orm.public.RoomInvitation.where({
      roomId,
      userId: input.userId,
    }).first()) as RoomInvitationRow | null;
    if (existing && !existing.acceptedAt && !existing.declinedAt) {
      throw new InvitationAlreadyExistsError();
    }

    const row = await this.prisma.transaction(async (tx) => {
      // Re-inviting resets the standing invitation in place (the unique key is
      // `(roomId, userId)`, which the ORM `upsert` does not target).
      const invitation = (
        existing
          ? await tx.orm.public.RoomInvitation.where({ id: existing.id }).update({
              invitedById: actor.userId,
              role: input.role,
              expiresAt: null,
              acceptedAt: null,
              declinedAt: null,
            })
          : await tx.orm.public.RoomInvitation.create({
              roomId,
              userId: input.userId,
              invitedById: actor.userId,
              role: input.role,
              expiresAt: null,
              acceptedAt: null,
              declinedAt: null,
            })
      ) as RoomInvitationRow;

      await this.feedFanout.pushAccountEvent(tx, input.userId, roomId, {
        type: 'invitation_created',
        invitationId: invitation.id,
        invitedById: actor.userId,
        role: invitation.role,
      });

      return invitation;
    });

    return toRoomInvitationView(row);
  }

  /**
   * The caller's pending invitations, newest first. Pending = neither accepted
   * nor declined (`expiresAt` is never written nor checked, like the resolver's
   * `pendingInvitation`); an invitation to a deleted room is left out.
   */
  async listMyInvitations(actor: PermissionPrincipal): Promise<MyRoomInvitationListView> {
    const invitations = (await this.prisma.orm.public.RoomInvitation.where((f) =>
      and(f.userId.eq(actor.userId), f.acceptedAt.isNull(), f.declinedAt.isNull()),
    )
      .orderBy((f) => f.createdAt.desc())
      .all()) as RoomInvitationRow[];
    if (invitations.length === 0) {
      return { items: [] };
    }

    const rooms = (await this.prisma.orm.public.Room.where((f) =>
      and(f.id.in(invitations.map((i) => i.roomId)), f.deletedAt.isNull()),
    ).all()) as InvitedRoomRow[];
    const roomsById = new Map(rooms.map((r) => [r.id, r]));
    const summaries = await this.userSummaries.readMany(invitations.map((i) => i.invitedById));

    return {
      items: invitations.flatMap((invitation) => {
        const room = roomsById.get(invitation.roomId);
        const invitedBy = summaries.get(invitation.invitedById);
        if (!room || !invitedBy) {
          return [];
        }

        return [
          {
            id: invitation.id,
            role: invitation.role,
            createdAt: invitation.createdAt,
            room: {
              id: room.id,
              type: room.type,
              name: room.name,
              topic: room.topic,
              visibility: room.visibility,
            },
            invitedBy,
          },
        ];
      }),
    };
  }

  async acceptInvitation(
    actor: PermissionPrincipal,
    invitationId: string,
  ): Promise<MembershipView> {
    const invitation = await this.findInvitationOrThrow(invitationId, actor.userId);
    await this.assertNotBanned(invitation.roomId, actor.userId);

    const now = new Date().toISOString();
    const membership = await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomInvitation.where({ id: invitationId }).update({ acceptedAt: now });

      const row = (await tx.orm.public.Membership.where({
        roomId: invitation.roomId,
        userId: actor.userId,
      }).upsert({
        create: {
          roomId: invitation.roomId,
          userId: actor.userId,
          role: invitation.role,
          invitedById: invitation.invitedById,
        },
        update: { role: invitation.role, invitedById: invitation.invitedById },
      })) as MembershipRow;

      await this.eventLog.append(tx, {
        roomId: invitation.roomId,
        type: 'member_joined',
        senderId: actor.userId,
        content: { userId: actor.userId, role: invitation.role },
      });

      return row;
    });

    await this.permissions.invalidateSubtree(invitation.roomId);

    return toMembershipView(membership);
  }

  async declineInvitation(actor: PermissionPrincipal, invitationId: string): Promise<void> {
    await this.findInvitationOrThrow(invitationId, actor.userId);

    await this.prisma.orm.public.RoomInvitation.where({ id: invitationId }).update({
      declinedAt: new Date().toISOString(),
    });
  }

  async createJoinRequest(actor: PermissionPrincipal, roomId: string): Promise<JoinRequestView> {
    await this.findRoomOrThrow(roomId);
    await this.assertNotBanned(roomId, actor.userId);
    await this.assertNotMember(roomId, actor.userId);

    const existing = (await this.prisma.orm.public.RoomJoinRequest.where({
      roomId,
      userId: actor.userId,
    }).first()) as JoinRequestRow | null;
    if (existing && existing.approved === null) {
      throw new JoinRequestAlreadyExistsError();
    }

    // A resolved request is reset to pending in place (the unique key is
    // `(roomId, userId)`, which the ORM `upsert` does not target).
    const row = (
      existing
        ? await this.prisma.orm.public.RoomJoinRequest.where({ id: existing.id }).update({
            resolvedAt: null,
            resolvedById: null,
            approved: null,
          })
        : await this.prisma.orm.public.RoomJoinRequest.create({
            roomId,
            userId: actor.userId,
            resolvedAt: null,
            resolvedById: null,
            approved: null,
          })
    ) as JoinRequestRow;

    return toJoinRequestView(row);
  }

  async approveJoinRequest(
    actor: PermissionPrincipal,
    roomId: string,
    requestId: string,
  ): Promise<MembershipView> {
    const room = await this.findRoomOrThrow(roomId);
    await this.permissions.assertCan(actor, roomId, 'room.manage_members');
    const joinRequest = await this.findJoinRequestOrThrow(roomId, requestId);

    const now = new Date().toISOString();
    const membership = await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomJoinRequest.where({ id: requestId }).update({
        resolvedAt: now,
        resolvedById: actor.userId,
        approved: true,
      });

      const row = (await tx.orm.public.Membership.where({
        roomId,
        userId: joinRequest.userId,
      }).upsert({
        create: { roomId, userId: joinRequest.userId, role: room.defaultRole, invitedById: null },
        update: { role: room.defaultRole },
      })) as MembershipRow;

      await this.eventLog.append(tx, {
        roomId,
        type: 'member_joined',
        senderId: actor.userId,
        content: { userId: joinRequest.userId, role: room.defaultRole },
      });

      await this.feedFanout.pushAccountEvent(tx, joinRequest.userId, roomId, {
        type: 'join_request_resolved',
        requestId,
        approved: true,
        resolvedById: actor.userId,
      });

      return row;
    });

    await this.permissions.invalidateSubtree(roomId);

    return toMembershipView(membership);
  }

  async rejectJoinRequest(
    actor: PermissionPrincipal,
    roomId: string,
    requestId: string,
  ): Promise<void> {
    await this.findRoomOrThrow(roomId);
    await this.permissions.assertCan(actor, roomId, 'room.manage_members');
    const joinRequest = await this.findJoinRequestOrThrow(roomId, requestId);

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomJoinRequest.where({ id: requestId }).update({
        resolvedAt: new Date().toISOString(),
        resolvedById: actor.userId,
        approved: false,
      });

      await this.feedFanout.pushAccountEvent(tx, joinRequest.userId, roomId, {
        type: 'join_request_resolved',
        requestId,
        approved: false,
        resolvedById: actor.userId,
      });
    });
  }

  async kick(actor: PermissionPrincipal, roomId: string, userId: string): Promise<void> {
    await this.findRoomOrThrow(roomId);
    await this.permissions.assertCan(actor, roomId, 'room.kick');
    await this.requireMembership(roomId, userId);

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.Membership.where({ roomId, userId }).delete();
      await this.eventLog.append(tx, {
        roomId,
        type: 'member_kicked',
        senderId: actor.userId,
        content: { userId },
      });
    });

    await this.permissions.invalidateSubtree(roomId);
  }

  async ban(actor: PermissionPrincipal, roomId: string, input: BanMember): Promise<void> {
    await this.findRoomOrThrow(roomId);
    await this.permissions.assertCan(actor, roomId, 'room.ban');

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomBan.where({ roomId, userId: input.userId }).upsert({
        create: {
          roomId,
          userId: input.userId,
          reason: input.reason ?? null,
          bannedById: actor.userId,
        },
        update: { reason: input.reason ?? null, bannedById: actor.userId },
      });
      await tx.orm.public.Membership.where({ roomId, userId: input.userId }).delete();

      await this.eventLog.append(tx, {
        roomId,
        type: 'member_banned',
        senderId: actor.userId,
        content: { userId: input.userId, reason: input.reason ?? null },
      });
    });

    await this.permissions.invalidateSubtree(roomId);
  }

  async unban(actor: PermissionPrincipal, roomId: string, userId: string): Promise<void> {
    await this.findRoomOrThrow(roomId);
    await this.permissions.assertCan(actor, roomId, 'room.ban');

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.RoomBan.where({ roomId, userId }).delete();
      await this.eventLog.append(tx, {
        roomId,
        type: 'member_unbanned',
        senderId: actor.userId,
        content: { userId },
      });
    });

    await this.permissions.invalidateSubtree(roomId);
  }

  async changeRole(
    actor: PermissionPrincipal,
    roomId: string,
    userId: string,
    role: RoomRole,
  ): Promise<MembershipView> {
    await this.findRoomOrThrow(roomId);
    await this.permissions.assertCan(actor, roomId, 'room.manage_roles');
    await this.requireMembership(roomId, userId);

    if (!actor.isOwner) {
      const callerRole = await this.permissions.effectiveRole(actor, roomId);
      if (!callerRole || ROLE_RANK[role] > ROLE_RANK[callerRole]) {
        throw new RoleAboveAuthorityError();
      }
    }

    const membership = await this.prisma.transaction(async (tx) => {
      const row = (await tx.orm.public.Membership.where({ roomId, userId }).update({
        role,
      })) as MembershipRow;

      await this.eventLog.append(tx, {
        roomId,
        type: 'role_changed',
        senderId: actor.userId,
        content: { userId, role },
      });

      return row;
    });

    await this.permissions.invalidateSubtree(roomId);

    return toMembershipView(membership);
  }

  private async findRoomOrThrow(id: string): Promise<RoomLookup> {
    const row = (await this.prisma.orm.public.Room.where({ id }).first()) as {
      id: string;
      type: string;
      visibility: string;
      defaultRole: RoomRole;
      deletedAt: string | null;
    } | null;
    if (!row || row.deletedAt) {
      throw new RoomNotFoundError();
    }

    return row;
  }

  private async requireMembership(roomId: string, userId: string): Promise<MembershipRow> {
    const row = (await this.prisma.orm.public.Membership.where({
      roomId,
      userId,
    }).first()) as MembershipRow | null;
    if (!row) {
      throw new MembershipNotFoundError();
    }

    return row;
  }

  private async assertNotMember(roomId: string, userId: string): Promise<void> {
    const row = (await this.prisma.orm.public.Membership.where({
      roomId,
      userId,
    }).first()) as unknown;
    if (row) {
      throw new RoomAlreadyMemberError();
    }
  }

  private async assertNotBanned(roomId: string, userId: string): Promise<void> {
    const row = (await this.prisma.orm.public.RoomBan.where({ roomId, userId }).first()) as unknown;
    if (row) {
      throw new RoomBannedError();
    }
  }

  private async findInvitationOrThrow(id: string, userId: string): Promise<RoomInvitationRow> {
    const row = (await this.prisma.orm.public.RoomInvitation.where({
      id,
    }).first()) as RoomInvitationRow | null;
    if (!row || row.userId !== userId) {
      throw new InvitationNotFoundError();
    }
    if (row.acceptedAt || row.declinedAt) {
      throw new InvitationAlreadyResolvedError();
    }

    return row;
  }

  private async findJoinRequestOrThrow(roomId: string, id: string): Promise<JoinRequestRow> {
    const row = (await this.prisma.orm.public.RoomJoinRequest.where((f) =>
      and(f.id.eq(id), f.roomId.eq(roomId)),
    ).first()) as JoinRequestRow | null;
    if (!row) {
      throw new JoinRequestNotFoundError();
    }
    if (row.approved !== null) {
      throw new JoinRequestAlreadyResolvedError();
    }

    return row;
  }
}
