import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { EffectiveMembersQuery } from '../membership/effective-members.query.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { EphemeralBroadcaster } from '../streaming/ephemeral-broadcaster.service.js';

/**
 * Typing signals (technical.md §15, issue #10): broadcast-only, never
 * persisted, never in the event log. Each signal is delivered to the room's
 * effective members (explicit members plus those of its ancestor spaces),
 * resolved at emission time, and never echoed to the sender.
 */
@Injectable()
export class TypingService {
  constructor(
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
    private readonly broadcaster: EphemeralBroadcaster,
    private readonly effectiveMembers: EffectiveMembersQuery,
  ) {}

  async broadcastTyping(actor: PermissionPrincipal, roomId: string): Promise<void> {
    await this.permissions.assertCan(actor, roomId, 'room.post');

    const ttl = this.config.get('typing.ttl');
    const signal = { roomId, userId: actor.userId, ttl };
    const members = await this.effectiveMembers.listAll(roomId);

    for (const { userId } of members) {
      if (userId !== actor.userId) {
        this.broadcaster.notifyTyping(userId, signal);
      }
    }
  }
}
