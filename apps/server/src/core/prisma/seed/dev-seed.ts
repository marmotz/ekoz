/**
 * Local-development seed data: a "Test" space holding a public "test" channel
 * that a batch of throwaway users have joined. Pure planning only; `prisma/seed.ts`
 * applies the plan to the database.
 */

export const DEV_SEED_SPACE_NAME = 'Test';
export const DEV_SEED_CHANNEL_NAME = 'test';
export const DEV_SEED_USER_COUNT = 100;
export const DEV_SEED_PASSWORD = 'TestPassword123!';

export interface DevSeedUser {
  /** Login identifier (matches the account identifier pattern). */
  readonly name: string;
  readonly email: string;
  readonly displayName: string;
}

export function buildDevSeedUsers(count: number = DEV_SEED_USER_COUNT): DevSeedUser[] {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const name = `testuser${String(n).padStart(3, '0')}`;
    return { name, email: `${name}@example.test`, displayName: `Test User ${n}` };
  });
}

/**
 * The `member_joined` payload written to the room event log for a join. Same
 * shape the join flow appends (`role` + `userId`).
 */
export function memberJoinedContent(
  userId: string,
  role: string,
): { role: string; userId: string } {
  return { role, userId };
}
