#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2304c06f408a2b4098270a2a5aa822173011bddc543e6b9974e35de62631afa5/contract';
import startContract from '../../snapshots/2304c06f408a2b4098270a2a5aa822173011bddc543e6b9974e35de62631afa5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/70724003d57754908cdda405cd0a68c41db1a523e3c12b3bef071c48881e10aa/contract';
import endContract from '../../snapshots/70724003d57754908cdda405cd0a68c41db1a523e3c12b3bef071c48881e10aa/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'membership',
        column: col('history_from_seq', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
