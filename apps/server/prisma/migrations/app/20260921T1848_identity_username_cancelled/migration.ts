#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5c906b8f045aa6a6276b19679d29a61e79af27f7b16bbef50fc8daa7a1c15f94/contract';
import startContract from '../../snapshots/5c906b8f045aa6a6276b19679d29a61e79af27f7b16bbef50fc8daa7a1c15f94/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/95a39466e21c08137e0ada8e9e33d167e796d292028bb01861340feb846865fa/contract';
import endContract from '../../snapshots/95a39466e21c08137e0ada8e9e33d167e796d292028bb01861340feb846865fa/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'username_change_request',
        constraint: 'username_change_request_status_check_19a2b525',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'username_change_request',
        constraint: 'username_change_request_status_check_fc16580c',
        expression: "\"status\" IN ('pending', 'approved', 'rejected', 'cancelled')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
