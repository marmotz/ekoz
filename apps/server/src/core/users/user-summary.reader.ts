import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { avatarUrl, userIdentifier } from '../http/user-links.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UserSummary } from './user-summary.js';

interface UserRow {
  id: string;
  name: string | null;
  status: string;
}

interface ProfileRow {
  userId: string;
  displayName: string;
  avatarBlobId: string | null;
}

/**
 * Resolves {@link UserSummary} values from `User` + `UserProfile`. It lives in
 * `core` and reads through `PrismaService` so feature modules that must not
 * import each other (`conversations` vs `identity`) still share one shape, built
 * with the same link helpers as `GET /me` and `GET /users/:identifier`.
 */
@Injectable()
export class UserSummaryReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** One summary per distinct id; an unknown id is summarised like a deleted account. */
  async readMany(userIds: readonly string[]): Promise<Map<string, UserSummary>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) {
      return new Map();
    }

    const users = (await this.prisma.orm.public.User.where((f) => f.id.in(ids)).all()) as UserRow[];
    const profiles = (await this.prisma.orm.public.UserProfile.where((f) =>
      f.userId.in(ids),
    ).all()) as ProfileRow[];

    const usersById = new Map(users.map((u) => [u.id, u]));
    const profilesById = new Map(profiles.map((p) => [p.userId, p]));

    return new Map(
      ids.map((id) => [
        id,
        this.summarise(id, usersById.get(id) ?? null, profilesById.get(id) ?? null),
      ]),
    );
  }

  private summarise(id: string, user: UserRow | null, profile: ProfileRow | null): UserSummary {
    if (!user || user.status === 'deleted') {
      return { id, identifier: null, displayName: null, avatarUrl: null };
    }

    return {
      id,
      identifier: user.name ? userIdentifier(user.name, this.config.get('server.domain')) : null,
      displayName: profile?.displayName ?? null,
      avatarUrl:
        user.name && profile?.avatarBlobId
          ? avatarUrl(this.config.get('server.api_url'), user.name, profile.avatarBlobId)
          : null,
    };
  }
}
