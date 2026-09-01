import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service.js';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { BlobService } from '../../../core/storage/blob.service.js';
import { RefreshTokenService } from '../auth/refresh-token.service.js';
import { SessionService } from '../auth/session.service.js';
import { InvalidCredentialsError, LastOwnerError, UserNotFoundError } from '../identity.errors.js';
import { AccountService } from './account.service.js';
import { PasswordService } from './password.service.js';

/**
 * Account lifecycle: suspension, deletion and owner management (technical.md
 * §15, issue #21). The invariant enforced everywhere here is **at least one
 * active owner** — the last owner cannot be suspended, deleted or demoted.
 */
@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accounts: AccountService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly blobs: BlobService,
    private readonly audit: AuditService
  ) {}

  async suspend(targetId: string, reason: string, actorUserId: string): Promise<void> {
    const user = await this.requireUser(targetId);
    if (user.status === 'deleted') {
      throw new UserNotFoundError();
    }

    await this.assertNotLastOwner(user.isOwner);

    const now = new Date().toISOString();
    await this.prisma.orm.public.User.where({ id: targetId }).update({
      status: 'suspended',
      suspendedAt: now,
      suspendedReason: reason,
      updatedAt: now,
    });

    await this.revokeAllSessions(targetId, 'account_suspended');
    await this.audit.record({
      action: 'identity.user_suspended',
      actorUserId,
      targetType: 'user',
      targetId,
      metadata: { reason },
    });
  }

  async unsuspend(targetId: string, actorUserId: string): Promise<void> {
    const user = await this.requireUser(targetId);
    if (user.status !== 'suspended') {
      return;
    }

    const now = new Date().toISOString();
    await this.prisma.orm.public.User.where({ id: targetId }).update({
      status: 'active',
      suspendedAt: null,
      suspendedReason: null,
      updatedAt: now,
    });

    await this.audit.record({
      action: 'identity.user_unsuspended',
      actorUserId,
      targetType: 'user',
      targetId,
    });
  }

  async deleteByOwner(targetId: string, actorUserId: string): Promise<void> {
    const user = await this.requireUser(targetId);
    await this.performDeletion(user.id, user.name, user.isOwner, actorUserId);
  }

  async deleteSelf(userId: string, password: string): Promise<void> {
    const user = await this.requireUser(userId);
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new InvalidCredentialsError();
    }

    await this.performDeletion(user.id, user.name, user.isOwner, userId);
  }

  async addOwner(targetId: string, actorUserId: string): Promise<void> {
    const user = await this.requireUser(targetId);
    if (user.status !== 'active') {
      throw new UserNotFoundError('Only an active account can be made an owner.');
    }

    if (user.isOwner) {
      return;
    }

    await this.accounts.setOwner(targetId, true);
    await this.audit.record({
      action: 'identity.owner_added',
      actorUserId,
      targetType: 'user',
      targetId,
    });
  }

  async removeOwner(targetId: string, actorUserId: string): Promise<void> {
    const user = await this.requireUser(targetId);
    if (!user.isOwner) {
      return;
    }

    await this.assertNotLastOwner(true);
    await this.accounts.setOwner(targetId, false);
    await this.audit.record({
      action: 'identity.owner_removed',
      actorUserId,
      targetType: 'user',
      targetId,
    });
  }

  /** The one-transaction scrub described in technical.md §15. */
  private async performDeletion(
    userId: string,
    name: string | null,
    isOwner: boolean,
    actorUserId: string
  ): Promise<void> {
    await this.assertNotLastOwner(isOwner);

    const profile = await this.accounts.getProfile(userId);
    const releaseDelay = this.config.get('identity.username_release_delay');
    const now = new Date().toISOString();

    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.User.where({ id: userId }).update({
        status: 'deleted',
        deletedAt: now,
        name: null,
        email: null,
        updatedAt: now,
      });

      await tx.orm.public.UserProfile.where({ userId }).update({
        displayName: 'Deleted account',
        bio: null,
        avatarBlobId: null,
        updatedAt: now,
      });

      if (profile?.avatarBlobId) {
        await this.blobs.release(profile.avatarBlobId, tx.orm);
      }

      if (name) {
        await tx.orm.public.ReservedUsername.create({
          name,
          reservedUntil: new Date(Date.now() + releaseDelay * 1000).toISOString(),
          reason: 'account_deleted',
        });
      }
    });

    await this.revokeAllSessions(userId, 'account_deleted');
    await this.audit.record({
      action: 'identity.account_deleted',
      actorUserId,
      targetType: 'user',
      targetId: userId,
    });
  }

  private async assertNotLastOwner(isOwner: boolean): Promise<void> {
    if (!isOwner) {
      return;
    }

    if ((await this.accounts.countActiveOwners()) <= 1) {
      throw new LastOwnerError();
    }
  }

  private async revokeAllSessions(userId: string, reason: string): Promise<void> {
    for (const session of await this.sessions.listForUser(userId)) {
      if (session.revokedAt === null) {
        await this.sessions.revoke(session.id, reason);
        await this.refreshTokens.revokeForSession(session.id);
      }
    }
  }

  private async requireUser(id: string) {
    const user = await this.accounts.findById(id);
    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }
}
