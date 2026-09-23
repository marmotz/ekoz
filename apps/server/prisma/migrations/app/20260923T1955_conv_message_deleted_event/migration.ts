#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/40480fe9c202bda5aa0d8d492c66e054d8d335ea5d506f0de3faa39865e2adc4/contract';
import endContract from '../../snapshots/40480fe9c202bda5aa0d8d492c66e054d8d335ea5d506f0de3faa39865e2adc4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/95a39466e21c08137e0ada8e9e33d167e796d292028bb01861340feb846865fa/contract';
import startContract from '../../snapshots/95a39466e21c08137e0ada8e9e33d167e796d292028bb01861340feb846865fa/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'room_event',
        constraint: 'room_event_type_check_869a5b2b',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'room_event',
        constraint: 'room_event_type_check_eaaedd9c',
        expression:
          "\"type\" IN ('message_created', 'message_edited', 'message_redacted', 'message_deleted', 'message_hidden', 'reaction_added', 'reaction_removed', 'member_joined', 'member_left', 'member_kicked', 'member_banned', 'member_unbanned', 'role_changed', 'permission_override_changed', 'room_created', 'room_updated', 'room_moved', 'room_deleted', 'pin_added', 'pin_removed', 'retention_changed', 'receipt_updated')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
