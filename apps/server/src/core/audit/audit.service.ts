import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../http/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** JSON-serialisable value, the shape the `metadata` jsonb column accepts. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type AuditMetadata = { [key: string]: JsonValue };

/** One audit entry. Actor / IP default to the ambient request context. */
export interface AuditEntry {
  /** Stable action name, namespaced by domain (e.g. `identity.user_registered`). */
  action: string;
  /** Overrides the context actor; pass `null` to force a system action. */
  actorUserId?: string | null;
  /** Overrides the context client IP. */
  actorIp?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** Structured context; must be JSON-serialisable. Defaults to `{}`. */
  metadata?: AuditMetadata;
}

/**
 * Append-only audit trail (technical.md §8). Features call `record(...)` for
 * security- and compliance-relevant events. There is deliberately no read,
 * update or delete API here — retention is a `server-administration` concern.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    const ctx = getRequestContext();
    await this.prisma.orm.public.AuditLog.create({
      action: entry.action,
      actorUserId: entry.actorUserId !== undefined ? entry.actorUserId : (ctx?.userId ?? null),
      actorIp: entry.actorIp !== undefined ? entry.actorIp : (ctx?.clientIp ?? null),
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
    });
  }
}
