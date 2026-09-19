import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { EphemeralBroadcaster } from '../streaming/ephemeral-broadcaster.service.js';

/**
 * Typing signals (technical.md §15, issue #10): broadcast-only, never
 * persisted, never in the event log — pure `EphemeralBroadcaster` fan-out to
 * `GET /events` subscribers for the room.
 */
@Injectable()
export class TypingService {
  constructor(
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
    private readonly broadcaster: EphemeralBroadcaster,
  ) {}

  async broadcastTyping(actor: PermissionPrincipal, roomId: string): Promise<void> {
    await this.permissions.assertCan(actor, roomId, 'room.post');

    const ttl = this.config.get('typing.ttl');
    this.broadcaster.emitTyping({ roomId, userId: actor.userId, ttl });
  }
}
