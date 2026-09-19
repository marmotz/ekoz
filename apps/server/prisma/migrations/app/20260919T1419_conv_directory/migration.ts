#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5c311d3780a0eac35bc475f7a85aae0e9b8d707407fe466f7e0e5fcfa76f33c6/contract';
import startContract from '../../snapshots/5c311d3780a0eac35bc475f7a85aae0e9b8d707407fe466f7e0e5fcfa76f33c6/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fe381f407a5b29c816375a9dd2df069b0fedee02dfce9d837a491b2ea8f7a859/contract';
import endContract from '../../snapshots/fe381f407a5b29c816375a9dd2df069b0fedee02dfce9d837a491b2ea8f7a859/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'room',
        index: 'room_directory_fts_4bb947ef',
        expression: "to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(topic, ''))",
        extras: { type: 'gin' },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
