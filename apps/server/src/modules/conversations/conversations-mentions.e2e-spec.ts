import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../../core/config/config.service.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

interface Target {
  type: string;
  target: string | null;
  token: string;
}

interface RecipientRow {
  type: string;
  target: string;
  userId: string;
  seq: bigint;
}

/**
 * Mention targets, audience, edit, `mentionsMe` (issue #173), unread counters
 * and "My mentions" (issue #174), end to end against a real database.
 */
describe('conversations — mentions (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let config: ConfigService;
  let prisma: PrismaService;

  const password = 'a-perfectly-fine-passphrase';
  const server = () => app.getHttpServer();
  const ids: Record<string, string> = {};

  // Logins are throttled per identifier, so each account logs in once.
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

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tokenOf = (name: string) => `@${name}/${config.get('server.domain')}`;

  const createSpace = async (token: string, name: string, visibility = 'public') =>
    (
      await request(server())
        .post('/spaces')
        .set(auth(token))
        .send({ name, visibility })
        .expect(201)
    ).body;

  const createChannel = async (
    token: string,
    parentId: string,
    name: string,
    visibility = 'public',
  ) =>
    (
      await request(server())
        .post('/rooms')
        .set(auth(token))
        .send({ parentId, name, visibility })
        .expect(201)
    ).body;

  const join = (token: string, roomId: string) =>
    request(server()).post(`/rooms/${roomId}/join`).set(auth(token));

  const send = (token: string, roomId: string, body: string, mentions?: unknown[]) =>
    request(server()).post(`/rooms/${roomId}/messages`).set(auth(token)).send({ body, mentions });

  const edit = (
    token: string,
    roomId: string,
    messageId: string,
    payload: Record<string, unknown>,
  ) =>
    request(server())
      .patch(`/rooms/${roomId}/messages/${messageId}`)
      .set(auth(token))
      .send(payload);

  const getMessage = async (token: string, roomId: string, messageId: string) =>
    (
      await request(server())
        .get(`/rooms/${roomId}/messages/${messageId}`)
        .set(auth(token))
        .expect(200)
    ).body;

  const recipients = async (messageId: string): Promise<RecipientRow[]> =>
    (await prisma.orm.public.MessageMentionRecipient.where({
      messageId,
    }).all()) as RecipientRow[];

  const audienceOf = async (messageId: string, type: string, target = '') =>
    (await recipients(messageId))
      .filter((row) => row.type === type && row.target === target)
      .map((row) => row.userId)
      .sort();

  const unread = async (token: string) =>
    (await request(server()).get('/me/mentions/unread').set(auth(token)).expect(200)).body
      .items as Array<{
      roomId: string;
      direct: number;
      collective: number;
    }>;

  const markRead = (token: string, roomId: string, seq: string) =>
    request(server()).put(`/rooms/${roomId}/receipt`).set(auth(token)).send({ seq });

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    accounts = app.get(AccountService);
    config = app.get(ConfigService);
    prisma = app.get(PrismaService);
    await accounts.createAccount({
      name: 'owner',
      email: 'owner@ekoz.example.com',
      password,
      displayName: 'The Owner',
      isOwner: true,
      emailVerified: true,
    });
    for (const name of ['alice', 'bob', 'carol', 'dave', 'erin']) {
      await accounts.createAccount({
        name,
        email: `${name}@ekoz.example.com`,
        password,
        displayName: name,
        emailVerified: true,
      });
    }
    for (const name of ['owner', 'alice', 'bob', 'carol', 'dave', 'erin']) {
      ids[name] = (await accounts.findByIdentifier(name))!.id;
    }
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  describe('sending', () => {
    it('sends every target type with a frozen token and a resolved audience', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'send-space');
      const channel = await createChannel(ownerToken, space.id, 'send-room');
      for (const name of ['bob', 'carol']) {
        await join(await login(name), channel.id).expect(201);
      }
      const group = (
        await request(server())
          .post(`/rooms/${channel.id}/groups`)
          .set(auth(ownerToken))
          .send({ name: 'devs', memberIds: [ids.carol] })
          .expect(201)
      ).body;

      const sent = await send(ownerToken, channel.id, 'hello @bob @all @member @devs', [
        { type: 'user', userId: ids.bob },
        { type: 'all' },
        { type: 'role', role: 'member' },
        { type: 'group', groupId: group.id },
        // Duplicates collapse.
        { type: 'user', userId: ids.bob },
        { type: 'all' },
      ]).expect(201);

      expect(sent.body.mentions).toEqual([
        { type: 'user', target: ids.bob, token: tokenOf('bob') },
        { type: 'all', target: null, token: '@all' },
        { type: 'role', target: 'member', token: '@member' },
        { type: 'group', target: group.id, token: '@devs' },
      ] satisfies Target[]);
      expect(sent.body.mentionsMe).toBeNull();

      const messageId = sent.body.id as string;
      expect(await audienceOf(messageId, 'user', ids.bob)).toEqual([ids.bob]);
      // Every effective member but the author.
      expect(await audienceOf(messageId, 'all')).toEqual([ids.bob, ids.carol].sort());
      expect(await audienceOf(messageId, 'role', 'member')).toEqual([ids.bob, ids.carol].sort());
      expect(await audienceOf(messageId, 'group', group.id)).toEqual([ids.carol]);

      // Recipients carry the message seq.
      for (const row of await recipients(messageId)) {
        expect(row.seq.toString()).toBe(sent.body.seq);
      }

      // The live event carries the targets, never a per-viewer field.
      const events = (await prisma.orm.public.RoomEvent.where({
        roomId: channel.id,
        type: 'message_created',
      }).all()) as unknown as Array<{
        content: { messageId: string; mentions: Target[]; mentionsMe?: unknown };
      }>;
      const event = events.find((e) => e.content.messageId === messageId);
      expect(event?.content.mentions).toEqual(sent.body.mentions);
      expect(event?.content).not.toHaveProperty('mentionsMe');
    });

    it('reports mentionsMe per viewer in REST responses', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'me-space');
      const channel = await createChannel(ownerToken, space.id, 'me-room');
      for (const name of ['bob', 'carol', 'dave']) {
        await join(await login(name), channel.id).expect(201);
      }

      const sent = await send(ownerToken, channel.id, '@bob @all', [
        { type: 'user', userId: ids.bob },
        { type: 'all' },
      ]).expect(201);
      const messageId = sent.body.id as string;

      expect((await getMessage(await login('bob'), channel.id, messageId)).mentionsMe).toBe(
        'direct',
      );
      expect((await getMessage(await login('carol'), channel.id, messageId)).mentionsMe).toBe(
        'collective',
      );
      expect((await getMessage(ownerToken, channel.id, messageId)).mentionsMe).toBeNull();

      const page = (
        await request(server())
          .get(`/rooms/${channel.id}/messages`)
          .set(auth(await login('bob')))
          .expect(200)
      ).body;
      expect(page.items.find((m: { id: string }) => m.id === messageId).mentionsMe).toBe('direct');

      const plain = await send(ownerToken, channel.id, 'nothing').expect(201);
      expect(
        (await getMessage(await login('bob'), channel.id, plain.body.id)).mentionsMe,
      ).toBeNull();
    });

    it('lets an inherited space member be mentioned, and refuses a stranger', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'inherit-space');
      const channel = await createChannel(ownerToken, space.id, 'inherit-room');
      // Alice is a member of the space only, not of the channel.
      await join(await login('alice'), space.id).expect(201);

      const ok = await send(ownerToken, channel.id, 'hi @alice', [
        { type: 'user', userId: ids.alice },
      ]).expect(201);
      expect(ok.body.mentions[0].token).toBe(tokenOf('alice'));
      expect(await audienceOf(ok.body.id, 'user', ids.alice)).toEqual([ids.alice]);

      const refused = await send(ownerToken, channel.id, 'hi @dave', [
        { type: 'user', userId: ids.dave },
      ]).expect(422);
      expect(refused.body.code).toBe('message.mention_not_member');

      // `@all` also reaches the inherited member.
      const all = await send(ownerToken, channel.id, '@all', [{ type: 'all' }]).expect(201);
      expect(await audienceOf(all.body.id, 'all')).toContain(ids.alice);
    });

    it('refuses collective targets in a dm, and a group that is not on the room chain', async () => {
      const ownerToken = await login('owner');
      const dm = (
        await request(server())
          .post('/dms')
          .set(auth(ownerToken))
          .send({ userId: ids.alice })
          .expect(201)
      ).body;

      for (const mention of [
        { type: 'all' },
        { type: 'role', role: 'member' },
        { type: 'group', groupId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
      ]) {
        const res = await send(ownerToken, dm.id, 'hi', [mention]).expect(422);
        expect(res.body.code).toBe('message.mention_invalid');
      }
      await send(ownerToken, dm.id, 'hi @alice', [{ type: 'user', userId: ids.alice }]).expect(201);

      const space = await createSpace(ownerToken, 'group-vis-space');
      const channelA = await createChannel(ownerToken, space.id, 'group-vis-a');
      const channelB = await createChannel(ownerToken, space.id, 'group-vis-b');
      const spaceGroup = (
        await request(server())
          .post(`/rooms/${space.id}/groups`)
          .set(auth(ownerToken))
          .send({ name: 'space-wide' })
          .expect(201)
      ).body;
      const ownGroup = (
        await request(server())
          .post(`/rooms/${channelA.id}/groups`)
          .set(auth(ownerToken))
          .send({ name: 'only-a' })
          .expect(201)
      ).body;

      // On an ancestor: fine. On a sibling channel: not visible.
      await send(ownerToken, channelB.id, '@space-wide', [
        { type: 'group', groupId: spaceGroup.id },
      ]).expect(201);
      const hidden = await send(ownerToken, channelB.id, '@only-a', [
        { type: 'group', groupId: ownGroup.id },
      ]).expect(422);
      expect(hidden.body.code).toBe('message.mention_invalid');
      await send(ownerToken, channelB.id, 'x', [{ type: 'role', role: 'nope' }]).expect(422);
    });

    it('freezes the audience and token: a later join or rename changes nothing', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'frozen-space');
      const channel = await createChannel(ownerToken, space.id, 'frozen-room');
      await join(await login('bob'), channel.id).expect(201);
      const group = (
        await request(server())
          .post(`/rooms/${channel.id}/groups`)
          .set(auth(ownerToken))
          .send({ name: 'before', memberIds: [ids.bob] })
          .expect(201)
      ).body;

      const sent = await send(ownerToken, channel.id, '@all @before', [
        { type: 'all' },
        { type: 'group', groupId: group.id },
      ]).expect(201);
      await join(await login('carol'), channel.id).expect(201);
      await request(server())
        .patch(`/rooms/${channel.id}/groups/${group.id}`)
        .set(auth(ownerToken))
        .send({ name: 'after' })
        .expect(200);

      expect(await audienceOf(sent.body.id, 'all')).toEqual([ids.bob]);
      const fetched = await getMessage(ownerToken, channel.id, sent.body.id);
      expect(fetched.mentions.map((m: Target) => m.token)).toEqual(['@all', '@before']);
    });
  });

  describe('editing', () => {
    it('keeps, removes and adds targets, with recipients at the edit seq', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'edit-space');
      const channel = await createChannel(ownerToken, space.id, 'edit-room');
      for (const name of ['bob', 'carol']) {
        await join(await login(name), channel.id).expect(201);
      }

      const sent = await send(ownerToken, channel.id, '@bob @all', [
        { type: 'user', userId: ids.bob },
        { type: 'all' },
      ]).expect(201);
      const messageId = sent.body.id as string;

      // `mentions` absent: targets untouched.
      const untouched = await edit(ownerToken, channel.id, messageId, {
        body: 'edited once',
      }).expect(200);
      expect(untouched.body.mentions).toEqual(sent.body.mentions);
      expect(await audienceOf(messageId, 'all')).toEqual([ids.bob, ids.carol].sort());

      // Keep bob, drop `all`, add carol.
      const edited = await edit(ownerToken, channel.id, messageId, {
        body: '@bob @carol',
        mentions: [
          { type: 'user', userId: ids.bob },
          { type: 'user', userId: ids.carol },
        ],
      }).expect(200);
      expect(edited.body.mentions).toEqual([
        { type: 'user', target: ids.bob, token: tokenOf('bob') },
        { type: 'user', target: ids.carol, token: tokenOf('carol') },
      ]);

      const editEvents = (await prisma.orm.public.RoomEvent.where({
        roomId: channel.id,
        type: 'message_edited',
      }).all()) as unknown as Array<{ seq: bigint; content: { messageId: string } }>;
      const lastEditSeq = editEvents
        .filter((e) => e.content.messageId === messageId)
        .map((e) => e.seq)
        .sort((a, b) => (a < b ? -1 : 1))
        .at(-1);

      const rows = await recipients(messageId);
      expect(rows.filter((r) => r.type === 'all')).toEqual([]);
      // Kept target: same recipient, still at the message seq.
      expect(rows.find((r) => r.type === 'user' && r.userId === ids.bob)?.seq.toString()).toBe(
        sent.body.seq,
      );
      // Added target: recipient at the seq of the `message_edited` event.
      expect(rows.find((r) => r.type === 'user' && r.userId === ids.carol)?.seq).toBe(lastEditSeq);
      expect(lastEditSeq?.toString()).not.toBe(sent.body.seq);

      // The mention is also on the REST views of the viewers.
      expect((await getMessage(await login('carol'), channel.id, messageId)).mentionsMe).toBe(
        'direct',
      );

      // An explicit empty list removes everything.
      const cleared = await edit(ownerToken, channel.id, messageId, {
        body: 'nobody',
        mentions: [],
      }).expect(200);
      expect(cleared.body.mentions).toEqual([]);
      expect(await recipients(messageId)).toEqual([]);
    });

    it('validates added targets on edit like on send', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'edit-invalid-space');
      const channel = await createChannel(ownerToken, space.id, 'edit-invalid-room');
      const sent = await send(ownerToken, channel.id, 'plain').expect(201);

      const refused = await edit(ownerToken, channel.id, sent.body.id, {
        body: 'plain',
        mentions: [{ type: 'user', userId: ids.dave }],
      }).expect(422);
      expect(refused.body.code).toBe('message.mention_not_member');
      // Nothing changed.
      expect((await getMessage(ownerToken, channel.id, sent.body.id)).mentions).toEqual([]);
    });

    it('never puts the author of the message in the audience of an added target', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'edit-author-space');
      const channel = await createChannel(ownerToken, space.id, 'edit-author-room');
      const bobToken = await login('bob');
      await join(bobToken, channel.id).expect(201);
      const sent = await send(bobToken, channel.id, 'mine').expect(201);

      // A moderator (the owner) edits: `@all` must not notify the message's author.
      await edit(ownerToken, channel.id, sent.body.id, {
        body: 'mine @all',
        mentions: [{ type: 'all' }],
      }).expect(200);
      expect(await audienceOf(sent.body.id, 'all')).toEqual([ids.owner]);
    });

    it('deletes targets and recipients when the message is deleted', async () => {
      const ownerToken = await login('owner');
      const space = await createSpace(ownerToken, 'redact-space');
      const channel = await createChannel(ownerToken, space.id, 'redact-room');
      await join(await login('bob'), channel.id).expect(201);
      const sent = await send(ownerToken, channel.id, '@bob', [
        { type: 'user', userId: ids.bob },
      ]).expect(201);
      expect((await recipients(sent.body.id)).length).toBe(1);

      await request(server())
        .delete(`/rooms/${channel.id}/messages/${sent.body.id}`)
        .set(auth(ownerToken))
        .expect(204);

      expect(await recipients(sent.body.id)).toEqual([]);
      expect(
        await prisma.orm.public.MessageMentionTarget.where({ messageId: sent.body.id }).all(),
      ).toEqual([]);
      const tombstone = await getMessage(await login('bob'), channel.id, sent.body.id);
      expect(tombstone.mentions).toEqual([]);
      expect(tombstone.mentionsMe).toBeNull();
    });
  });

  describe('unread counters', () => {
    it('counts distinct unread messages per room, direct before collective', async () => {
      const ownerToken = await login('owner');
      const bobToken = await login('bob');
      const space = await createSpace(ownerToken, 'unread-space');
      const channel = await createChannel(ownerToken, space.id, 'unread-room');
      await join(bobToken, channel.id).expect(201);

      // Direct and collective on one message counts once, as direct.
      const both = await send(ownerToken, channel.id, '@bob @all', [
        { type: 'user', userId: ids.bob },
        { type: 'all' },
      ]).expect(201);
      const collective = await send(ownerToken, channel.id, '@all', [{ type: 'all' }]).expect(201);
      await send(ownerToken, channel.id, 'plain').expect(201);

      const before = (await unread(bobToken)).find((i) => i.roomId === channel.id);
      expect(before).toEqual({ roomId: channel.id, direct: 1, collective: 1 });

      // Reading up to the first message clears it, and only it.
      await markRead(bobToken, channel.id, both.body.seq).expect(200);
      const partial = (await unread(bobToken)).find((i) => i.roomId === channel.id);
      expect(partial).toEqual({ roomId: channel.id, direct: 0, collective: 1 });

      await markRead(bobToken, channel.id, collective.body.seq).expect(200);
      expect((await unread(bobToken)).find((i) => i.roomId === channel.id)).toBeUndefined();

      // The author has nothing unread for their own messages.
      expect((await unread(ownerToken)).find((i) => i.roomId === channel.id)).toBeUndefined();
    });

    it('counts a mention added by an edit as unread above the read marker', async () => {
      const ownerToken = await login('owner');
      const bobToken = await login('bob');
      const space = await createSpace(ownerToken, 'unread-edit-space');
      const channel = await createChannel(ownerToken, space.id, 'unread-edit-room');
      await join(bobToken, channel.id).expect(201);

      const sent = await send(ownerToken, channel.id, 'old message').expect(201);
      await markRead(bobToken, channel.id, sent.body.seq).expect(200);
      expect((await unread(bobToken)).find((i) => i.roomId === channel.id)).toBeUndefined();

      await edit(ownerToken, channel.id, sent.body.id, {
        body: 'old message @bob',
        mentions: [{ type: 'user', userId: ids.bob }],
      }).expect(200);

      expect((await unread(bobToken)).find((i) => i.roomId === channel.id)).toEqual({
        roomId: channel.id,
        direct: 1,
        collective: 0,
      });
    });

    it('excludes redacted and hidden messages', async () => {
      const ownerToken = await login('owner');
      const bobToken = await login('bob');
      const space = await createSpace(ownerToken, 'unread-gone-space');
      const channel = await createChannel(ownerToken, space.id, 'unread-gone-room');
      await join(bobToken, channel.id).expect(201);

      const mention = [{ type: 'user', userId: ids.bob }];
      const redacted = await send(ownerToken, channel.id, '@bob 1', mention).expect(201);
      const hidden = await send(ownerToken, channel.id, '@bob 2', mention).expect(201);
      await send(ownerToken, channel.id, '@bob 3', mention).expect(201);
      expect((await unread(bobToken)).find((i) => i.roomId === channel.id)?.direct).toBe(3);

      await request(server())
        .delete(`/rooms/${channel.id}/messages/${redacted.body.id}`)
        .set(auth(ownerToken))
        .expect(204);
      await prisma.orm.public.Message.where({ id: hidden.body.id }).update({
        hiddenAt: new Date().toISOString(),
      });

      expect((await unread(bobToken)).find((i) => i.roomId === channel.id)?.direct).toBe(1);
    });

    it('covers a dm, and drops a room the caller can no longer read', async () => {
      const ownerToken = await login('owner');
      const carolToken = await login('carol');
      const dm = (
        await request(server())
          .post('/dms')
          .set(auth(ownerToken))
          .send({ userId: ids.carol })
          .expect(201)
      ).body;
      await send(ownerToken, dm.id, '@carol', [{ type: 'user', userId: ids.carol }]).expect(201);
      expect((await unread(carolToken)).find((i) => i.roomId === dm.id)).toEqual({
        roomId: dm.id,
        direct: 1,
        collective: 0,
      });

      // A private channel Carol is invited to, then kicked out of.
      const space = await createSpace(ownerToken, 'unread-private-space', 'private');
      const channel = await createChannel(ownerToken, space.id, 'unread-private', 'private');
      const invitation = (
        await request(server())
          .post(`/rooms/${channel.id}/invitations`)
          .set(auth(ownerToken))
          .send({ userId: ids.carol })
          .expect(201)
      ).body;
      await request(server())
        .post(`/invitations/${invitation.id}/accept`)
        .set(auth(carolToken))
        .expect(201);
      await send(ownerToken, channel.id, '@carol', [{ type: 'user', userId: ids.carol }]).expect(
        201,
      );
      expect((await unread(carolToken)).find((i) => i.roomId === channel.id)?.direct).toBe(1);

      await request(server())
        .delete(`/rooms/${channel.id}/members/${ids.carol}`)
        .set(auth(ownerToken))
        .expect(204);
      expect((await unread(carolToken)).find((i) => i.roomId === channel.id)).toBeUndefined();
      expect((await unread(carolToken)).find((i) => i.roomId === dm.id)).toBeDefined();
    });
  });

  describe('GET /me/mentions', () => {
    it('lists newest first with a cursor, unread flags, room info and mentionsMe', async () => {
      const ownerToken = await login('owner');
      const erinToken = await login('erin');
      const space = await createSpace(ownerToken, 'list-space');
      const channel = await createChannel(ownerToken, space.id, 'list-room');
      await join(erinToken, channel.id).expect(201);

      const mention = [{ type: 'user', userId: ids.erin }];
      const sent = [];
      for (const body of ['1', '2', '3', '4', '5']) {
        sent.push((await send(ownerToken, channel.id, `@erin ${body}`, mention).expect(201)).body);
      }
      const collective = (await send(ownerToken, channel.id, '@all', [{ type: 'all' }]).expect(201))
        .body;
      await send(ownerToken, channel.id, 'not for erin').expect(201);
      await markRead(erinToken, channel.id, sent[2].seq).expect(200);

      const get = (query: Record<string, string> = {}) =>
        request(server()).get('/me/mentions').query(query).set(auth(erinToken)).expect(200);

      const first = await get({ limit: '4' });
      expect(first.body.items.map((i: { message: { id: string } }) => i.message.id)).toEqual([
        collective.id,
        sent[4].id,
        sent[3].id,
        sent[2].id,
      ]);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      expect(first.body.items[0]).toMatchObject({
        mentionsMe: 'collective',
        unread: true,
        room: { id: channel.id, type: 'channel', name: 'list-room', parentId: space.id },
      });
      expect(first.body.items[0].message.mentionsMe).toBe('collective');
      expect(first.body.items[1]).toMatchObject({ mentionsMe: 'direct', unread: true });
      // Read items stay listed, flagged.
      expect(first.body.items[3]).toMatchObject({ mentionsMe: 'direct', unread: false });

      const second = await get({ limit: '4', cursor: first.body.nextCursor });
      expect(second.body.items.map((i: { message: { id: string } }) => i.message.id)).toEqual([
        sent[1].id,
        sent[0].id,
      ]);
      expect(second.body.nextCursor).toBeNull();
      expect(second.body.items.every((i: { unread: boolean }) => i.unread === false)).toBe(true);

      const all = await get();
      expect(all.body.items).toHaveLength(6);
    });

    it('skips redacted and hidden messages and rooms the caller can no longer read', async () => {
      const ownerToken = await login('owner');
      const carolToken = await login('carol');
      const space = await createSpace(ownerToken, 'list-gone-space', 'private');
      const channel = await createChannel(ownerToken, space.id, 'list-gone-room', 'private');
      const invitation = (
        await request(server())
          .post(`/rooms/${channel.id}/invitations`)
          .set(auth(ownerToken))
          .send({ userId: ids.carol })
          .expect(201)
      ).body;
      await request(server())
        .post(`/invitations/${invitation.id}/accept`)
        .set(auth(carolToken))
        .expect(201);

      const mention = [{ type: 'user', userId: ids.carol }];
      const kept = (await send(ownerToken, channel.id, '@carol kept', mention).expect(201)).body;
      const redacted = (await send(ownerToken, channel.id, '@carol redacted', mention).expect(201))
        .body;
      const hidden = (await send(ownerToken, channel.id, '@carol hidden', mention).expect(201))
        .body;
      await request(server())
        .delete(`/rooms/${channel.id}/messages/${redacted.id}`)
        .set(auth(ownerToken))
        .expect(204);
      await prisma.orm.public.Message.where({ id: hidden.id }).update({
        hiddenAt: new Date().toISOString(),
      });

      const inRoom = (items: Array<{ room: { id: string }; message: { id: string } }>) =>
        items.filter((i) => i.room.id === channel.id);
      const visible = (
        await request(server()).get('/me/mentions').set(auth(carolToken)).expect(200)
      ).body.items;
      expect(inRoom(visible).map((i: { message: { id: string } }) => i.message.id)).toEqual([
        kept.id,
      ]);

      await request(server())
        .delete(`/rooms/${channel.id}/members/${ids.carol}`)
        .set(auth(ownerToken))
        .expect(204);
      const after = (await request(server()).get('/me/mentions').set(auth(carolToken)).expect(200))
        .body.items;
      expect(inRoom(after)).toEqual([]);
    });

    it('rejects a bad limit and ignores a malformed cursor', async () => {
      const daveToken = await login('dave');

      await request(server())
        .get('/me/mentions')
        .query({ limit: '0' })
        .set(auth(daveToken))
        .expect(422);
      await request(server())
        .get('/me/mentions')
        .query({ cursor: 'not-a-cursor' })
        .set(auth(daveToken))
        .expect(200);
      await request(server()).get('/me/mentions').expect(401);
      await request(server()).get('/me/mentions/unread').expect(401);
    });
  });
});
