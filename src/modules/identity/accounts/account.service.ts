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

export interface CreateAccountInput {
  name: string;
  email: string;
  password: string;
  displayName: string;
  isOwner?: boolean;
  emailVerified?: boolean;
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
    private readonly passwords: PasswordService
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

      return created;
    })) as UserRow;

    return toRecord(user);
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
      const row = (await this.prisma.orm.public.User.where({ email: value }).first()) as UserRow | null;

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
