import { Readable } from 'node:stream';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';
import { AuditService } from '../../../core/audit/audit.service.js';
import { ConfigService } from '../../../core/config/config.service.js';
import { getRequestContext } from '../../../core/http/request-context.js';
import { avatarUrl, userIdentifier } from '../../../core/http/user-links.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { type Blob, BlobService } from '../../../core/storage/blob.service.js';
import { BlobAccessRegistry } from '../../../core/storage/blob-access.registry.js';
import { sniffContentType } from '../../../core/storage/sniff-content-type.js';
import { StorageQuotaService } from '../../../core/storage/storage-quota.service.js';
import { AccountService } from '../accounts/account.service.js';
import { toAccountView } from '../accounts/account.view.js';
import {
  AvatarRejectedError,
  AvatarTooLargeError,
  ProfileInvalidError,
  ProfileNotFoundError,
} from '../identity.errors.js';
import type { UploadedAvatar } from './avatar.js';
import type { MeViewSchema, PublicProfileViewSchema } from './profile.dto.js';

/**
 * `GET /me` and `GET /users/:identifier` payloads (technical.md §13). Shapes
 * defined once as `MeViewSchema` / `PublicProfileViewSchema` in
 * [`profile.dto.ts`](./profile.dto.ts).
 */
export type MeView = z.infer<typeof MeViewSchema>;
export type PublicProfileView = z.infer<typeof PublicProfileViewSchema>;

/**
 * Profile and avatar (technical.md §13, issue #19). Avatars are stored as
 * server-core blobs; this service owns their `retain` / `release` lifecycle and
 * registers the blob access policy that lets any authenticated caller read an
 * avatar.
 */
@Injectable()
export class ProfileService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accounts: AccountService,
    private readonly blobs: BlobService,
    private readonly blobAccess: BlobAccessRegistry,
    private readonly quotas: StorageQuotaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // Avatar access policy (technical.md §13, §6): an authenticated caller may
    // download any blob that is currently referenced as somebody's avatar.
    this.blobAccess.register(async (blob, context) => {
      if (!context?.userId) {
        return false;
      }

      const holder = (await this.prisma.orm.public.UserProfile.where({
        avatarBlobId: blob.id,
      }).first()) as { userId: string } | null;

      return holder !== null;
    });
  }

  async getMe(userId: string): Promise<MeView> {
    const user = await this.accounts.findById(userId);
    const profile = await this.accounts.getProfile(userId);
    if (!user || !profile) {
      throw new ProfileNotFoundError();
    }

    const view = toAccountView(user, profile.displayName, this.config.get('server.domain'));

    return {
      ...view,
      bio: profile.bio,
      avatarUrl: this.avatarUrl(user.name, profile.avatarBlobId),
      pendingEmail: await this.accounts.pendingEmailOf(userId),
    };
  }

  async getPublicProfile(identifier: string): Promise<PublicProfileView> {
    const user = await this.accounts.findByIdentifier(identifier);
    if (!user || user.status === 'deleted' || user.name === null) {
      throw new ProfileNotFoundError();
    }

    const profile = await this.accounts.getProfile(user.id);
    if (!profile) {
      throw new ProfileNotFoundError();
    }

    return {
      id: user.id,
      identifier: userIdentifier(user.name, this.config.get('server.domain')),
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: this.avatarUrl(user.name, profile.avatarBlobId),
    };
  }

  async updateProfile(
    userId: string,
    patch: { displayName?: string; bio?: string | null },
  ): Promise<MeView> {
    const profile = await this.accounts.getProfile(userId);
    if (!profile) {
      throw new ProfileNotFoundError();
    }

    const update: { displayName?: string; bio?: string | null; updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    if (patch.displayName !== undefined) {
      update.displayName = patch.displayName.trim();
    }

    if (patch.bio !== undefined) {
      const bio = patch.bio?.trim() ?? null;
      if (bio !== null && bio.length > this.config.get('profile.bio_max_length')) {
        throw new ProfileInvalidError(
          `The bio must be at most ${this.config.get('profile.bio_max_length')} characters.`,
        );
      }
      update.bio = bio && bio.length > 0 ? bio : null;
    }

    await this.prisma.orm.public.UserProfile.where({ userId }).update(update);

    return this.getMe(userId);
  }

  /** Store a new avatar, replacing any previous one (technical.md §13). */
  async setAvatar(userId: string, file: UploadedAvatar): Promise<{ avatarUrl: string }> {
    const maxBytes = this.config.get('avatar.max_size_bytes');
    if (file.size > maxBytes) {
      throw new AvatarTooLargeError(`The avatar must be at most ${maxBytes} bytes.`);
    }

    const mime = await sniffContentType(file.buffer);
    if (!this.config.get('avatar.allowed_mime').includes(mime)) {
      throw new AvatarRejectedError();
    }

    const profile = await this.accounts.getProfile(userId);
    if (!profile) {
      throw new ProfileNotFoundError();
    }

    await this.quotas.assertCanStore(userId, BigInt(file.size));

    const blob = await this.blobs.ingest(Readable.from(file.buffer), {
      contentType: mime,
      uploaderId: userId,
    });
    const previous = profile.avatarBlobId;

    await this.prisma.transaction(async (tx) => {
      await this.blobs.retain(blob.id, tx.orm);
      await tx.orm.public.UserProfile.where({ userId }).update({
        avatarBlobId: blob.id,
        updatedAt: new Date().toISOString(),
      });
      if (previous && previous !== blob.id) {
        await this.blobs.release(previous, tx.orm);
      }
    });

    await this.audit.record({
      action: 'identity.avatar_updated',
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
      metadata: { blobId: blob.id },
    });

    const user = await this.accounts.findById(userId);
    const avatarUrl = this.avatarUrl(user?.name ?? null, blob.id);
    if (!avatarUrl) {
      throw new ProfileNotFoundError();
    }

    return { avatarUrl };
  }

  /** Remove the current avatar (technical.md §13). Idempotent. */
  async deleteAvatar(userId: string): Promise<void> {
    const profile = await this.accounts.getProfile(userId);
    if (!profile?.avatarBlobId) {
      return;
    }

    const previous = profile.avatarBlobId;
    await this.prisma.transaction(async (tx) => {
      await tx.orm.public.UserProfile.where({ userId }).update({
        avatarBlobId: null,
        updatedAt: new Date().toISOString(),
      });
      await this.blobs.release(previous, tx.orm);
    });

    await this.audit.record({
      action: 'identity.avatar_removed',
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
    });
  }

  /**
   * The blob backing `identifier`'s avatar, or `null` when there is none or the
   * current caller may not read it. The access decision goes through the same
   * {@link BlobAccessRegistry} hook server-core's `GET /blobs/:id` consults, so
   * this route borrows that policy rather than trusting its own guard alone
   * (technical.md §13, issue #19).
   */
  async resolveAvatarBlob(identifier: string): Promise<Blob | null> {
    const user = await this.accounts.findByIdentifier(identifier);
    if (!user || user.status === 'deleted') {
      return null;
    }

    const avatarBlobId = (await this.accounts.getProfile(user.id))?.avatarBlobId;
    const blob = avatarBlobId ? await this.blobs.findById(avatarBlobId) : null;
    if (!blob) {
      return null;
    }

    return (await this.blobAccess.isAllowed(blob, getRequestContext())) ? blob : null;
  }

  /** Open the bytes of an avatar blob for streaming. */
  openAvatarContent(blob: Blob): Promise<NodeJS.ReadableStream> {
    return this.blobs.openContent(blob);
  }

  private avatarUrl(name: string | null, avatarBlobId: string | null): string | null {
    if (!name || !avatarBlobId) {
      return null;
    }

    return avatarUrl(this.config.get('server.api_url'), name, avatarBlobId);
  }
}
