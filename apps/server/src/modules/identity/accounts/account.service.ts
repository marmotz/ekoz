import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { IdentifierService } from './identifier.service.js';
import { PasswordService } from './password.service.js';

export type UserStatus = 'active' | 'suspended' | 'deleted';

/** An account row as the identity feature consumes it (never leaks the hash outward). */
export interface UserRecord {
  id: string;
  name: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  passwordHash: string;
  isOwner: boolean;
  status: UserStatus;
  createdAt: string;
}

/** The transaction handle passed to {@link CreateAccountInput.afterCreate}. */
export type AccountTx = Parameters<Parameters<PrismaService['transaction']>[0]>[0];

/** A {@link UserProfile} row as the identity feature consumes it. */
export interface ProfileRecord {
  displayName: string;
  bio: string | null;
  avatarBlobId: string | null;
  updatedAt: string;
}

interface ProfileRow {
  displayName: string;
  bio: string | null;
  avatarBlobId: string | null;
  updatedAt: string;
}

export interface CreateAccountInput {
  name: string;
  email: string;
  password: string;
  displayName: string;
  isOwner?: boolean;
  emailVerified?: boolean;
  /**
   * Runs inside the same transaction as the `User` / `UserProfile` insert,
   * after both exist — used by registration to consume an invitation and by
   * the first-owner setup to create the initial session atomically.
   */
  afterCreate?: (tx: AccountTx, user: UserRecord) => Promise<void>;
}

/**
 * Account persistence (technical.md §4-§6). This task ships only what auth and
 * the tests need — create an account, look one up by identifier or id, upgrade a
 * stale password hash. Registration modes, invitations and the lifecycle
 * (suspend / delete / owners) each arrive on their own task.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly identifiers: IdentifierService,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Create a `User` + its `UserProfile` in one transaction. Validates and
   * reserves the identifier, normalises the email, hashes the password.
   */
  async createAccount(input: CreateAccountInput): Promise<UserRecord> {
    const name = await this.identifiers.assertAvailable(input.name);
    const email = input.email.normalize('NFC').trim().toLowerCase();
    const passwordHash = await this.passwords.hash(input.password);
    const now = new Date().toISOString();

    const user = (await this.prisma.transaction(async (tx) => {
      const created = (await tx.orm.public.User.create({
        name,
        email,
        emailVerifiedAt: input.emailVerified ? now : null,
        passwordHash,
        isOwner: input.isOwner ?? false,
        status: 'active',
        updatedAt: now,
      })) as UserRow;

      await tx.orm.public.UserProfile.create({
        userId: created.id,
        displayName: input.displayName,
        bio: null,
        avatarBlobId: null,
        updatedAt: now,
      });

      if (input.afterCreate) {
        await input.afterCreate(tx, toRecord(created));
      }

      return created;
    })) as UserRow;

    return toRecord(user);
  }

  /** Look up by (already-normalised or raw) email address. */
  async findByEmail(email: string): Promise<UserRecord | null> {
    const value = email.normalize('NFC').trim().toLowerCase();
    const row = (await this.prisma.orm.public.User.where({
      email: value,
    }).first()) as UserRow | null;

    return row ? toRecord(row) : null;
  }

  /** `true` when at least one active owner account exists. */
  async ownerExists(): Promise<boolean> {
    const row = (await this.prisma.orm.public.User.where({
      isOwner: true,
      status: 'active',
    }).first()) as { id: string } | null;

    return row !== null;
  }

  /** Number of active accounts flagged as owners. */
  async countActiveOwners(): Promise<number> {
    const rows = (await this.prisma.orm.public.User.where({
      isOwner: true,
      status: 'active',
    }).all()) as Array<{ id: string }>;

    return rows.length;
  }

  /** Flip the owner flag on an account. */
  async setOwner(id: string, isOwner: boolean): Promise<void> {
    await this.prisma.orm.public.User.where({ id }).update({
      isOwner,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Mark `userId`'s current email verified (idempotent). */
  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.orm.public.User.where({ id: userId }).update({
      emailVerifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Apply a verified email change: set the new address and stamp it verified.
   * The caller has already checked the address is still free.
   */
  async applyEmailChange(userId: string, email: string): Promise<void> {
    const now = new Date().toISOString();
    await this.prisma.orm.public.User.where({ id: userId }).update({
      email: email.normalize('NFC').trim().toLowerCase(),
      emailVerifiedAt: now,
      updatedAt: now,
    });
  }

  /** The profile row for `userId` (display name, bio, avatar), or `null`. */
  async getProfile(userId: string): Promise<ProfileRecord | null> {
    const row = (await this.prisma.orm.public.UserProfile.first({ userId })) as ProfileRow | null;

    return row
      ? {
          displayName: row.displayName,
          bio: row.bio,
          avatarBlobId: row.avatarBlobId,
          updatedAt: row.updatedAt,
        }
      : null;
  }

  /** The profile display name for `userId`, or a neutral fallback for emails. */
  async displayNameOf(userId: string): Promise<string> {
    return (await this.getProfile(userId))?.displayName ?? 'there';
  }

  /**
   * The address of an email change still awaiting verification: the user's
   * unconsumed, unexpired `EmailVerification` row whose `email` differs from
   * `User.email` (a row equal to it is the initial verification). `startVerification`
   * keeps at most one unconsumed row per user.
   */
  async pendingEmailOf(userId: string): Promise<string | null> {
    const user = await this.findById(userId);
    const rows = (await this.prisma.orm.public.EmailVerification.where({ userId })
      .where((v) => v.consumedAt.isNull())
      .all()) as Array<{ email: string; expiresAt: string }>;

    const now = Date.now();
    const pending = rows.find(
      (row) => Date.parse(row.expiresAt) > now && row.email !== user?.email,
    );

    return pending?.email ?? null;
  }

  /** Look up by primary key. */
  async findById(id: string): Promise<UserRecord | null> {
    const row = (await this.prisma.orm.public.User.first({ id })) as UserRow | null;

    return row ? toRecord(row) : null;
  }

  /**
   * Resolve a login identifier: bare `name`, full `name/server` (the server half
   * must match `server.domain`), or an email address.
   */
  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    const value = identifier.normalize('NFC').trim().toLowerCase();

    if (value.includes('@')) {
      const row = (await this.prisma.orm.public.User.where({
        email: value,
      }).first()) as UserRow | null;

      return row ? toRecord(row) : null;
    }

    let name = value;
    if (value.includes('/')) {
      const slash = value.indexOf('/');
      name = value.slice(0, slash);
      const server = value.slice(slash + 1);
      if (server !== this.config.get('server.domain')) {
        return null;
      }
    }

    const row = (await this.prisma.orm.public.User.where({ name }).first()) as UserRow | null;

    return row ? toRecord(row) : null;
  }

  /** Set the account identifier (`name`). The caller has validated availability. */
  async updateName(id: string, name: string, tx?: AccountTx): Promise<void> {
    const orm = tx?.orm ?? this.prisma.orm;
    await orm.public.User.where({ id }).update({ name, updatedAt: new Date().toISOString() });
  }

  /** Replace the stored password hash (login-time rehash on a policy drift). */
  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.orm.public.User.where({ id }).update({
      passwordHash,
      updatedAt: new Date().toISOString(),
    });
  }
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  passwordHash: string;
  isOwner: boolean;
  status: UserStatus;
  createdAt: string;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    passwordHash: row.passwordHash,
    isOwner: row.isOwner,
    status: row.status,
    createdAt: row.createdAt,
  };
}
