#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a9714f71132db57054704f04a75a2152ef393fafb22465164e2d11a1c17cbcca/contract';
import endContract from '../../snapshots/a9714f71132db57054704f04a75a2152ef393fafb22465164e2d11a1c17cbcca/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/bd889d18ea39917148ac0d79619b3145e1626c49e79ac382473424a936d98fe4/contract';
import startContract from '../../snapshots/bd889d18ea39917148ac0d79619b3145e1626c49e79ac382473424a936d98fe4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'membership',
        column: col('hidden_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
