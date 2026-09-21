#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/95a39466e21c08137e0ada8e9e33d167e796d292028bb01861340feb846865fa/contract';
import endContract from '../../snapshots/95a39466e21c08137e0ada8e9e33d167e796d292028bb01861340feb846865fa/contract.json' with { type: 'json' };
import startContract from '../../snapshots/95a39466e21c08137e0ada8e9e33d167e796d292028bb01861340feb846865fa/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Rooms created before creator-membership existed have no member row for
      // their creator: backfill one per live `space` / `channel` that has none.
      rawSql({
        id: 'data.backfill-room-creator-membership',
        label: 'Backfill creator memberships for existing spaces and channels',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'Insert a membership for the creator of each room lacking one',
            sql: `INSERT INTO "public"."membership" ("room_id", "user_id", "role", "joined_at", "invited_by_id")
SELECT r."id", r."created_by_id",
  CASE r."type" WHEN 'space' THEN 'space_admin' ELSE 'room_admin' END,
  r."created_at", NULL
FROM "public"."room" r
WHERE r."type" IN ('space', 'channel')
  AND r."deleted_at" IS NULL
  AND r."created_by_id" IS NOT NULL
ON CONFLICT ("room_id", "user_id") DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
