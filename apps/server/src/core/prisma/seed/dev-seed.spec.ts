import { describe, expect, it } from 'vitest';
import { IdentifierService } from '../../../modules/identity/accounts/identifier.service.js';
import { buildDevSeedUsers, DEV_SEED_USER_COUNT, memberJoinedContent } from './dev-seed.js';

describe('dev seed', () => {
  it('builds the default batch of users with unique, valid identifiers', () => {
    const users = buildDevSeedUsers();

    expect(users).toHaveLength(DEV_SEED_USER_COUNT);
    expect(new Set(users.map((u) => u.name)).size).toBe(DEV_SEED_USER_COUNT);
    expect(new Set(users.map((u) => u.email)).size).toBe(DEV_SEED_USER_COUNT);
    for (const user of users) {
      expect(user.name).toMatch(IdentifierService.PATTERN);
    }
    expect(users[0]).toEqual({
      name: 'testuser001',
      email: 'testuser001@example.test',
      displayName: 'Test User 1',
    });
  });

  it('builds the member_joined payload', () => {
    expect(memberJoinedContent('u1', 'member')).toEqual({ role: 'member', userId: 'u1' });
  });
});
