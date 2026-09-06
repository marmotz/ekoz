import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service.js';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  UserNotFoundError,
  UsernameChangeCooldownError,
  UsernameChangeRequestNotFoundError,
  UsernameChangeRequestResolvedError,
  UsernameImmutableError,
} from '../identity.errors.js';
import { AccountService, type AccountTx } from './account.service.js';
import { IdentifierService } from './identifier.service.js';

export type UsernameChangeOutcome =
  | { status: 'applied'; identifier: string }
  | { status: 'pending'; requestId: string };

interface UsernameChangeRequestRow {
  id: string;
  userId: string;
  requestedName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
}

/**
 * Policy-driven identifier changes (technical.md §17, issue #20).
 *
 * `identity.username_change_policy` selects the behaviour: `immutable` refuses,
 * `available` applies immediately (subject to a cooldown), `approval` queues a
 * {@link UsernameChangeRequestRow} for an owner. Applying a change reserves the
 * freed name for `identity.username_release_delay`.
 */
@Injectable()
export class UsernameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accounts: AccountService,
    private readonly identifiers: IdentifierService,
    private readonly audit: AuditService,
  ) {}

  async changeOwn(userId: string, rawName: string): Promise<UsernameChangeOutcome> {
    const policy = this.config.get('identity.username_change_policy');
    if (policy === 'immutable') {
      throw new UsernameImmutableError();
    }

    const user = await this.accounts.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    const name = await this.identifiers.assertAvailable(rawName);
    if (name === user.name) {
      return { status: 'applied', identifier: this.identifierOf(name) };
    }

    if (policy === 'approval') {
      const row = (await this.prisma.orm.public.UsernameChangeRequest.create({
        userId,
        requestedName: name,
        status: 'pending',
        resolvedAt: null,
        resolvedByUserId: null,
      })) as UsernameChangeRequestRow;

      await this.audit.record({
        action: 'identity.username_change_requested',
        actorUserId: userId,
        targetType: 'user',
        targetId: userId,
        metadata: { requestedName: name },
      });

      return { status: 'pending', requestId: row.id };
    }

    await this.assertCooldownClear(userId);
    await this.applyChange(userId, name, userId);

    return { status: 'applied', identifier: this.identifierOf(name) };
  }

  async listRequests(
    status?: 'pending' | 'approved' | 'rejected',
  ): Promise<UsernameChangeRequestRow[]> {
    const rows = (
      status
        ? await this.prisma.orm.public.UsernameChangeRequest.where({ status }).all()
        : await this.prisma.orm.public.UsernameChangeRequest.all()
    ) as UsernameChangeRequestRow[];

    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async approve(requestId: string, ownerId: string): Promise<{ identifier: string }> {
    const request = await this.pendingRequest(requestId);

    // Re-check availability at decision time — the name may have been taken.
    const name = await this.identifiers.assertAvailable(request.requestedName);
    await this.applyChange(request.userId, name, ownerId);
    await this.resolve(requestId, 'approved', ownerId);

    return { identifier: this.identifierOf(name) };
  }

  async reject(requestId: string, ownerId: string): Promise<void> {
    await this.pendingRequest(requestId);
    await this.resolve(requestId, 'rejected', ownerId);
    await this.audit.record({
      action: 'identity.username_change_rejected',
      actorUserId: ownerId,
      targetType: 'username_change_request',
      targetId: requestId,
    });
  }

  /** Apply `name` to `userId`, reserving the freed identifier (technical.md §17). */
  private async applyChange(userId: string, name: string, actorUserId: string): Promise<void> {
    const user = await this.accounts.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    const previous = user.name;
    const releaseDelay = this.config.get('identity.username_release_delay');

    await this.prisma.transaction(async (tx: AccountTx) => {
      await this.accounts.updateName(userId, name, tx);
      if (previous && previous !== name) {
        await tx.orm.public.ReservedUsername.create({
          name: previous,
          reservedUntil: new Date(Date.now() + releaseDelay * 1000).toISOString(),
          reason: 'username_changed',
        });
      }
    });

    await this.audit.record({
      action: 'identity.username_changed',
      actorUserId,
      targetType: 'user',
      targetId: userId,
      metadata: { from: previous, to: name },
    });
  }

  private async assertCooldownClear(userId: string): Promise<void> {
    const cooldown = this.config.get('identity.username_change_cooldown');
    if (cooldown <= 0) {
      return;
    }

    const last = (await this.prisma.orm.public.AuditLog.where({
      actorUserId: userId,
      action: 'identity.username_changed',
    })
      .orderBy((a) => a.at.desc())
      .first()) as { at: string } | null;

    if (last && Date.parse(last.at) + cooldown * 1000 > Date.now()) {
      throw new UsernameChangeCooldownError();
    }
  }

  private async pendingRequest(requestId: string): Promise<UsernameChangeRequestRow> {
    const row = (await this.prisma.orm.public.UsernameChangeRequest.first({
      id: requestId,
    })) as UsernameChangeRequestRow | null;
    if (!row) {
      throw new UsernameChangeRequestNotFoundError();
    }
    if (row.status !== 'pending') {
      throw new UsernameChangeRequestResolvedError();
    }

    return row;
  }

  private async resolve(
    requestId: string,
    status: 'approved' | 'rejected',
    ownerId: string,
  ): Promise<void> {
    await this.prisma.orm.public.UsernameChangeRequest.where({ id: requestId }).update({
      status,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: ownerId,
    });
  }

  private identifierOf(name: string): string {
    return `${name}/${this.config.get('server.domain')}`;
  }
}
