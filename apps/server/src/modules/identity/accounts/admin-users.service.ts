import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { SessionService } from '../auth/session.service.js';
import { UserNotFoundError } from '../identity.errors.js';
import type { UserStatus } from './account.service.js';
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListQuery,
  AdminUserListResponse,
} from './admin-users.dto.js';

interface AdminUserRow {
  id: string;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  status: UserStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  emailVerifiedAt: string | null;
}

interface AdminUserListRow extends AdminUserRow {
  displayName: string | null;
}

interface AdminUserCursor {
  createdAt: string;
  id: string;
}

const CURSOR_EPOCH = '1970-01-01T00:00:00.000Z';

function encodeCursor(cursor: AdminUserCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(token: string): AdminUserCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Partial<AdminUserCursor>).createdAt === 'string' &&
      typeof (parsed as Partial<AdminUserCursor>).id === 'string'
    ) {
      return parsed as AdminUserCursor;
    }
    return null;
  } catch {
    return null;
  }
}

/** Wraps `q` for `ILIKE`, escaping its own wildcard characters. */
function likePattern(q: string): string {
  return `%${q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

/**
 * Admin-facing account reads (technical.md §2.1-§2.2, issue #14). Owner-only;
 * `list` joins `UserProfile` for `displayName` search with raw SQL, the repo
 * convention for a cross-table search at this volume.
 */
@Injectable()
export class AdminUsersQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
  ) {}

  async list(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const hasCursor = cursor !== null;
    const hasStatus = query.status !== undefined;
    const hasOwner = query.owner !== undefined;
    const qPattern = likePattern(query.q ?? '');

    const plan = this.prisma.raw.sql`
      SELECT u.id AS id, u.name AS name, u.email AS email, u.is_owner AS "isOwner",
             u.status AS status, u.suspended_at AS "suspendedAt", u.suspended_reason AS "suspendedReason",
             u.created_at AS "createdAt", u.email_verified_at AS "emailVerifiedAt",
             p.display_name AS "displayName"
      FROM "user" u
      LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE (u.name ILIKE ${qPattern} OR u.email ILIKE ${qPattern} OR p.display_name ILIKE ${qPattern})
        AND (${hasStatus} = false OR u.status = ${query.status ?? 'active'})
        AND (${hasOwner} = false OR u.is_owner = ${query.owner ?? false})
        AND (${hasCursor} = false OR (u.created_at, u.id) < (${cursor?.createdAt ?? CURSOR_EPOCH}, ${cursor?.id ?? ''}))
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ${query.limit + 1}
    `
      .returnsRow({
        id: { codecId: 'pg/text@1', nullable: false },
        name: { codecId: 'pg/text@1', nullable: true },
        email: { codecId: 'pg/text@1', nullable: true },
        isOwner: { codecId: 'pg/bool@1', nullable: false },
        status: { codecId: 'pg/text@1', nullable: false },
        suspendedAt: { codecId: 'pg/timestamptz-string@1', nullable: true },
        suspendedReason: { codecId: 'pg/text@1', nullable: true },
        createdAt: { codecId: 'pg/timestamptz-string@1', nullable: false },
        emailVerifiedAt: { codecId: 'pg/timestamptz-string@1', nullable: true },
        displayName: { codecId: 'pg/text@1', nullable: true },
      })
      .build();

    const rows = (await this.prisma.runtime().query(plan)) as AdminUserListRow[];
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const domain = this.config.get('server.domain');
    const last = page.at(-1);

    return {
      items: page.map((row) => this.toListItem(row, domain)),
      nextCursor:
        hasNextPage && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  async get(id: string): Promise<AdminUserDetail> {
    const row = (await this.prisma.orm.public.User.first({ id })) as AdminUserRow | null;
    if (!row) {
      throw new UserNotFoundError();
    }

    const profile = (await this.prisma.orm.public.UserProfile.first({
      userId: id,
    })) as { displayName: string } | null;
    const sessions = await this.sessions.listForUser(id);
    const domain = this.config.get('server.domain');

    return {
      ...this.toListItem({ ...row, displayName: profile?.displayName ?? null }, domain),
      emailVerifiedAt: row.emailVerifiedAt,
      activeSessionCount: sessions.filter((s) => s.revokedAt === null).length,
    };
  }

  private toListItem(row: AdminUserListRow, domain: string): AdminUserListItem {
    return {
      id: row.id,
      identifier: row.name ? `${row.name}/${domain}` : null,
      email: row.email,
      displayName: row.displayName ?? 'there',
      isOwner: row.isOwner,
      emailVerified: row.emailVerifiedAt !== null,
      status: row.status,
      createdAt: row.createdAt,
      suspendedAt: row.suspendedAt,
      suspendedReason: row.suspendedReason,
    };
  }
}
