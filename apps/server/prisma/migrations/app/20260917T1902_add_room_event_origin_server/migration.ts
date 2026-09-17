#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/19215e056f2aba61741c3158ed53b6f13c276f4cb311b2d6dc8a0ef5567549c6/contract';
import endContract from '../../snapshots/19215e056f2aba61741c3158ed53b6f13c276f4cb311b2d6dc8a0ef5567549c6/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/30b81e67b2f532a5b193a405f9e66c9697c74179a816de6def580c51a8769ab8/contract';
import startContract from '../../snapshots/30b81e67b2f532a5b193a405f9e66c9697c74179a816de6def580c51a8769ab8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';
import postgres from '@prisma/orm-postgres/runtime';

const { sql: db, contract } = postgres<End>({ contractJson: endContract });

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'room_event',
        column: col('origin_server', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dataTransform(contract, 'backfill-room_event-origin_server', {
        check: () =>
          db.public.room_event
            .select('room_id')
            .where((f, fns) => fns.eq(f.origin_server, null))
            .limit(1),
        run: () =>
          db.public.room_event
            .update((f, fns) => ({
              origin_server: fns.raw`(SELECT origin_server FROM room WHERE room.id = room_event.room_id)`.returns(
                'pg/text@1',
              ),
            }))
            .where((f, fns) => fns.eq(f.origin_server, null)),
      }),
      this.setNotNull({ schema: 'public', table: 'room_event', column: 'origin_server' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
