import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { UserSummaryReader } from '../../../core/users/user-summary.reader.js';
import type { PermissionPrincipal } from '../permissions/permissions.service.js';
import type { ContactsQuery, ContactsResponse } from './contacts.dto.js';

/** Most contacts one search returns. */
const CONTACTS_LIMIT = 20;

/** Escapes the `ILIKE` wildcards (and the escape character) of user input. */
function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

/**
 * People the caller can start a conversation with: active users sharing at
 * least one explicit membership with the caller in a non-deleted room.
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userSummaries: UserSummaryReader,
  ) {}

  async search(actor: PermissionPrincipal, query: ContactsQuery): Promise<ContactsResponse> {
    const escaped = escapeLike(query.query);
    const prefix = `${escaped}%`;
    const contains = `%${escaped}%`;

    const plan = this.prisma.raw.sql`
      SELECT u.id AS "id", p.display_name AS "displayName"
      FROM "user" u
      JOIN user_profile p ON p.user_id = u.id
      WHERE u.status = 'active'
        AND u.id <> ${actor.userId}
        AND (u.name ILIKE ${prefix} OR p.display_name ILIKE ${contains})
        AND EXISTS (
          SELECT 1
          FROM membership mine
          JOIN membership other ON other.room_id = mine.room_id AND other.user_id = u.id
          JOIN room r ON r.id = mine.room_id AND r.deleted_at IS NULL
          WHERE mine.user_id = ${actor.userId}
        )
      ORDER BY p.display_name ASC, u.id ASC
      LIMIT ${CONTACTS_LIMIT}
    `
      .returnsRow({
        id: { codecId: 'pg/text@1', nullable: false },
        displayName: { codecId: 'pg/text@1', nullable: false },
      })
      .build();

    const rows = (await this.prisma.runtime().query(plan)) as Array<{ id: string }>;
    const summaries = await this.userSummaries.readMany(rows.map((row) => row.id));

    return {
      items: rows.flatMap((row) => {
        const summary = summaries.get(row.id);

        return summary ? [summary] : [];
      }),
    };
  }
}
