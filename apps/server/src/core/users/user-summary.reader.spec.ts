import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UserSummaryReader } from './user-summary.reader.js';

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

function makeReader(users: UserRow[], profiles: ProfileRow[]) {
  const userQuery = vi.fn(() => ({ all: async () => users }));
  const profileQuery = vi.fn(() => ({ all: async () => profiles }));
  const prisma = {
    orm: { public: { User: { where: userQuery }, UserProfile: { where: profileQuery } } },
  } as unknown as PrismaService;
  const config = {
    get: (key: string) =>
      ({ 'server.domain': 'ekoz.example.com', 'server.api_url': 'https://api.ekoz.example.com' })[
        key
      ],
  } as unknown as ConfigService;

  return { reader: new UserSummaryReader(prisma, config), userQuery, profileQuery };
}

describe('UserSummaryReader (unit)', () => {
  it('builds the identifier and the versioned avatar URL like GET /me', async () => {
    const { reader } = makeReader(
      [{ id: 'u1', name: 'alice', status: 'active' }],
      [{ userId: 'u1', displayName: 'Alice', avatarBlobId: 'blob-1' }],
    );

    expect((await reader.readMany(['u1'])).get('u1')).toEqual({
      id: 'u1',
      identifier: 'alice/ekoz.example.com',
      displayName: 'Alice',
      avatarUrl: 'https://api.ekoz.example.com/users/alice/avatar?v=blob-1',
    });
  });

  it('has no avatar URL without an avatar', async () => {
    const { reader } = makeReader(
      [{ id: 'u1', name: 'alice', status: 'active' }],
      [{ userId: 'u1', displayName: 'Alice', avatarBlobId: null }],
    );

    expect((await reader.readMany(['u1'])).get('u1')?.avatarUrl).toBeNull();
  });

  it('has no identifier nor avatar URL without a username, but keeps the display name', async () => {
    const { reader } = makeReader(
      [{ id: 'u1', name: null, status: 'active' }],
      [{ userId: 'u1', displayName: 'Alice', avatarBlobId: 'blob-1' }],
    );

    expect((await reader.readMany(['u1'])).get('u1')).toEqual({
      id: 'u1',
      identifier: null,
      displayName: 'Alice',
      avatarUrl: null,
    });
  });

  it('nulls every field for a deleted account and for an unknown id', async () => {
    const { reader } = makeReader(
      [{ id: 'u1', name: 'alice', status: 'deleted' }],
      [{ userId: 'u1', displayName: 'Deleted account', avatarBlobId: 'blob-1' }],
    );

    const summaries = await reader.readMany(['u1', 'ghost']);
    const nulled = { identifier: null, displayName: null, avatarUrl: null };
    expect(summaries.get('u1')).toEqual({ id: 'u1', ...nulled });
    expect(summaries.get('ghost')).toEqual({ id: 'ghost', ...nulled });
  });

  it('queries nothing for an empty list and once for duplicated ids', async () => {
    const { reader, userQuery } = makeReader([], []);

    expect((await reader.readMany([])).size).toBe(0);
    expect(userQuery).not.toHaveBeenCalled();

    const summaries = await reader.readMany(['u1', 'u1']);
    expect(summaries.size).toBe(1);
    expect(userQuery).toHaveBeenCalledTimes(1);
  });
});
