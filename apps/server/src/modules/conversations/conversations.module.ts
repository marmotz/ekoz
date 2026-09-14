import { Module } from '@nestjs/common';
import { EventLogService } from './events/event-log.service.js';
import { PermissionsController } from './permissions/permissions.controller.js';
import { PermissionsService } from './permissions/permissions.service.js';
import { RoleDefaultCapabilitiesSeeder } from './permissions/role-default-capabilities.seeder.js';
import { RoomsController } from './rooms/rooms.controller.js';
import { RoomsService } from './rooms/rooms.service.js';

/**
 * Conversations (technical.md). Room model and hierarchy (#1), per-room event
 * log and seq allocation (#2), capability ACL and resolver (#3). Membership,
 * dm/group_dm, directory, messages, reactions, receipts, presence, sync and
 * retention each arrive with their own issue (#4-#13).
 */
@Module({
  controllers: [RoomsController, PermissionsController],
  providers: [EventLogService, PermissionsService, RoomsService, RoleDefaultCapabilitiesSeeder],
  exports: [EventLogService, PermissionsService],
})
export class ConversationsModule {}
