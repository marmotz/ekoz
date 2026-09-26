import { Module } from '@nestjs/common';
import { UserSummaryReader } from '../../core/users/user-summary.reader.js';
import { ContactsController } from './contacts/contacts.controller.js';
import { ContactsService } from './contacts/contacts.service.js';
import { DirectoryController } from './directory/directory.controller.js';
import { DirectoryService } from './directory/directory.service.js';
import { ConversationListService } from './dm/conversation-list.service.js';
import { DmController } from './dm/dm.controller.js';
import { DmService } from './dm/dm.service.js';
import { GroupDmController } from './dm/group-dm.controller.js';
import { GroupDmService } from './dm/group-dm.service.js';
import { GroupLifecycleService } from './dm/group-lifecycle.service.js';
import { EventLogService } from './events/event-log.service.js';
import { GroupsController } from './groups/groups.controller.js';
import { GroupsService } from './groups/groups.service.js';
import { EffectiveMembersQuery } from './membership/effective-members.query.js';
import { HistoryFloorService } from './membership/history-floor.service.js';
import {
  MembershipController,
  MyRoomInvitationsController,
} from './membership/membership.controller.js';
import { MembershipService } from './membership/membership.service.js';
import { MentionsController } from './mentions/mentions.controller.js';
import { MentionsService } from './mentions/mentions.service.js';
import { MentionResolver } from './messages/mention-resolver.js';
import { MessagesController } from './messages/messages.controller.js';
import { MessagesService } from './messages/messages.service.js';
import { MessagesPolicyController } from './messages/messages-policy.controller.js';
import { ModerationController } from './moderation/moderation.controller.js';
import { ModerationService } from './moderation/moderation.service.js';
import { PermissionsController } from './permissions/permissions.controller.js';
import { PermissionsService } from './permissions/permissions.service.js';
import { RoleDefaultCapabilitiesSeeder } from './permissions/role-default-capabilities.seeder.js';
import { PresenceController } from './presence/presence.controller.js';
import { PresenceService } from './presence/presence.service.js';
import { InProcessPresenceStore, PRESENCE_STORE } from './presence/presence.store.js';
import { PresenceSweepService } from './presence/presence-sweep.service.js';
import { TypingController } from './presence/typing.controller.js';
import { TypingService } from './presence/typing.service.js';
import { ReactionsController } from './reactions/reactions.controller.js';
import { ReactionsService } from './reactions/reactions.service.js';
import { ReceiptsController } from './receipts/receipts.controller.js';
import { ReceiptsService } from './receipts/receipts.service.js';
import { RetentionController } from './retention/retention.controller.js';
import { RetentionService } from './retention/retention.service.js';
import { RetentionWorkerService } from './retention/retention-worker.service.js';
import { RoomsController } from './rooms/rooms.controller.js';
import { RoomsService } from './rooms/rooms.service.js';
import { EphemeralBroadcaster } from './streaming/ephemeral-broadcaster.service.js';
import { EventsController } from './streaming/events.controller.js';
import { FeedFanoutService } from './streaming/feed-fanout.service.js';
import { FeedPruningService } from './streaming/feed-pruning.service.js';
import { FeedReaderService } from './streaming/feed-reader.service.js';
import { SyncController } from './streaming/sync.controller.js';
import { SyncService } from './streaming/sync.service.js';

/**
 * Conversations (technical.md). Room model and hierarchy (#1), per-room event
 * log and seq allocation (#2), capability ACL and resolver (#3), membership
 * lifecycle (#4), direct/group conversations (#5), public directory (#6),
 * messages/mentions/replies/pins (#7), message edit/delete/tombstones (#8),
 * reactions and read markers (#9), presence and typing (#10), sync/account
 * feed/SSE stream (#11), retention policies and worker (#12), local
 * moderation (#13), room groups (web-client-mentions).
 */
@Module({
  controllers: [
    RoomsController,
    PermissionsController,
    MembershipController,
    MyRoomInvitationsController,
    DirectoryController,
    MessagesController,
    MessagesPolicyController,
    DmController,
    ReactionsController,
    ReceiptsController,
    SyncController,
    EventsController,
    PresenceController,
    TypingController,
    RetentionController,
    ModerationController,
    GroupsController,
    MentionsController,
    ContactsController,
    GroupDmController,
  ],
  providers: [
    EventLogService,
    PermissionsService,
    RoomsService,
    RoleDefaultCapabilitiesSeeder,
    MembershipService,
    UserSummaryReader,
    DirectoryService,
    MessagesService,
    ModerationService,
    DmService,
    ConversationListService,
    ReactionsService,
    ReceiptsService,
    FeedFanoutService,
    FeedReaderService,
    FeedPruningService,
    SyncService,
    EphemeralBroadcaster,
    PresenceService,
    PresenceSweepService,
    TypingService,
    { provide: PRESENCE_STORE, useClass: InProcessPresenceStore },
    RetentionService,
    RetentionWorkerService,
    EffectiveMembersQuery,
    HistoryFloorService,
    GroupsService,
    MentionResolver,
    MentionsService,
    ContactsService,
    GroupDmService,
    GroupLifecycleService,
  ],
  exports: [EventLogService, PermissionsService],
})
export class ConversationsModule {}
