import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';
import { PermissionsService } from './permissions/permissions.service.js';

/**
 * Guards the `GET /rooms` SQL against the capability resolver (issue #79): the
 * listing computes roles in one query over `membership` and `room_closure`
 * instead of calling {@link PermissionsService.effectiveRole} per room, so
 * every `member` and `inherited` item must carry the role the resolver would
 * give. A change to either side that is not mirrored in the other fails here.
 */
describe('conversations — GET /rooms role matches the permission resolver (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let permissions: PermissionsService;

  const password = 'a-perfectly-fine-passphrase';
  const users = ['alice', 'bob', 'carol'] as const;
  const server = () => app.getHttpServer();

  // Logins are rate limited: one token per account for the whole file.
  const tokens = new Map<string, string>();
  const login = async (identifier: string): Promise<string> => {
    const cached = tokens.get(identifier);
    if (cached) {
      return cached;
    }

    const res = await request(server())
      .post('/auth/login')
      .send({ identifier, password })
      .expect(200);
    tokens.set(identifier, res.body.accessToken as string);

    return res.body.accessToken as string;
  };

  const userIdOf = async (name: string): Promise<string> =>
    (await accounts.findByIdentifier(name))?.id as string;

  const createSpace = async (name: string, parentId?: string, visibility = 'private') =>
    (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${await login('owner')}`)
        .send({ name, visibility, ...(parentId && { parentId }) })
        .expect(201)
    ).body.id as string;

  const createChannel = async (name: string, parentId: string, visibility = 'private') =>
    (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${await login('owner')}`)
        .send({ name, parentId, visibility })
        .expect(201)
    ).body.id as string;

  /** Owner invites `name` to `roomId` with `role`, `name` accepts. */
  const addMember = async (name: string, roomId: string, role: string) => {
    const invitation = await request(server())
      .post(`/rooms/${roomId}/invitations`)
      .set('Authorization', `Bearer ${await login('owner')}`)
      .send({ userId: await userIdOf(name), role })
      .expect(201);
    await request(server())
      .post(`/invitations/${invitation.body.id}/accept`)
      .set('Authorization', `Bearer ${await login(name)}`)
      .expect(201);
  };

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    accounts = app.get(AccountService);
    permissions = app.get(PermissionsService);
    await accounts.createAccount({
      name: 'owner',
      email: 'owner@ekoz.example.com',
      password,
      displayName: 'The Owner',
      isOwner: true,
      emailVerified: true,
    });
    for (const name of users) {
      await accounts.createAccount({
        name,
        email: `${name}@ekoz.example.com`,
        password,
        displayName: name,
        emailVerified: true,
      });
    }

    // A tree mixing every way to reach a room: nested spaces down to
    // `rooms.max_depth`, memberships at several levels with different roles
    // (nearest wins), an explicit channel role below a space role, public
    // rooms (whose `defaultRole` the resolver would use without a
    // membership), and a lone channel in a space the user does not belong to.
    const root = await createSpace('Root', undefined, 'public');
    const level1 = await createSpace('Level 1', root);
    const level2 = await createSpace('Level 2', level1, 'public');
    const level3 = await createSpace('Level 3', level2);
    const level4 = await createSpace('Level 4', level3);
    const rootChannel = await createChannel('root-channel', root, 'public');
    const level1Channel = await createChannel('level1-channel', level1);
    const level3Channel = await createChannel('level3-channel', level3, 'invite');
    const other = await createSpace('Other', undefined, 'public');
    const lone = await createChannel('lone', other, 'public');

    await addMember('alice', root, 'reader');
    await addMember('alice', level2, 'moderator');
    await addMember('alice', level3Channel, 'member');

    await addMember('bob', level1, 'space_admin');
    await addMember('bob', level1Channel, 'reader');
    await addMember('bob', level4, 'member');

    await addMember('carol', level3, 'room_admin');
    await addMember('carol', lone, 'moderator');
    await addMember('carol', rootChannel, 'member');
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it.each(['owner', ...users])(
    'lists %s with the resolver role on every member and inherited item',
    async (name) => {
      const principal = { userId: await userIdOf(name), isOwner: name === 'owner' };
      const res = await request(server())
        .get('/rooms')
        .set('Authorization', `Bearer ${await login(name)}`)
        .expect(200);
      const items = (
        res.body.items as Array<{ id: string; role: string | null; access: string }>
      ).filter((item) => item.access !== 'context');
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(item.role).not.toBeNull();
        expect({ id: item.id, role: item.role }).toEqual({
          id: item.id,
          role: await permissions.effectiveRole(principal, item.id),
        });
      }
    },
  );
});
