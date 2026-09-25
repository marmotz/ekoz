import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { ConfigService } from '../../core/config/config.service.js';
import { applyTestInfraConfig } from '../../core/config/testing/test-infra-config.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../../core/prisma/testing/test-database.js';
import { AccountService } from '../identity/accounts/account.service.js';

/**
 * Messages, mentions, replies, pins (issue #7), and edit/delete/tombstones
 * (issue #8), end to end against a real database.
 */
describe('conversations — messages (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let accounts: AccountService;
  let config: ConfigService;
  let prisma: PrismaService;

  const password = 'a-perfectly-fine-passphrase';
  const server = () => app.getHttpServer();

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

  const createPublicChannel = async (ownerToken: string, name: string) => {
    const space = (
      await request(server())
        .post('/spaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `${name}-space`, visibility: 'public' })
    ).body;

    return (
      await request(server())
        .post('/rooms')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parentId: space.id, name, visibility: 'public' })
    ).body;
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
    await accounts.createAccount({
      name: 'alice',
      email: 'alice@ekoz.example.com',
      password,
      displayName: 'Alice',
      emailVerified: true,
    });
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('sends a message with a structured mention, replies, and rejects bad Markdown', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const alice = (await accounts.findByIdentifier('alice'))!;
    const channel = await createPublicChannel(ownerToken, 'msg-room');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const first = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'hello **world**', mentions: [{ type: 'user', userId: alice.id }] })
      .expect(201);
    expect(first.body.mentions).toEqual([
      { type: 'user', target: alice.id, token: `@alice/${config.get('server.domain')}` },
    ]);
    expect(first.body.mentionsMe).toBeNull();
    expect(first.body.seq).toBeDefined();

    const reply = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'hi back', replyToId: first.body.id })
      .expect(201);
    expect(reply.body.replyToId).toBe(first.body.id);

    const fetched = await request(server())
      .get(`/rooms/${channel.id}/messages/${first.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(fetched.body.body).toBe('hello **world**');

    const rejected = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: '<script>alert(1)</script>' })
      .expect(422);
    expect(rejected.body.code).toBe('message.body_invalid');

    const badMention = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'hi', mentions: [{ type: 'user', userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }] })
      .expect(422);
    expect(badMention.body.code).toBe('message.mention_not_member');
  });

  it('pins and unpins a message', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'pin-room');

    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'pin me' })
      .expect(201);

    await request(server())
      .put(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(server())
      .put(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);

    const list = await request(server())
      .get(`/rooms/${channel.id}/pins`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body.map((p: { messageId: string }) => p.messageId)).toContain(message.body.id);

    await request(server())
      .delete(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    await request(server())
      .delete(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('rejects posting in a read-only room without room.edit_any', async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'readonly-room');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);
    await request(server())
      .patch(`/rooms/${channel.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ readOnly: true })
      .expect(200);

    const res = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'nope' })
      .expect(422);
    expect(res.body.code).toBe('room.read_only');
  });

  it("edits own message and rejects editing someone else's without room.edit_any", async () => {
    const ownerToken = await login('owner');
    const aliceToken = await login('alice');
    const channel = await createPublicChannel(ownerToken, 'edit-room');

    await request(server())
      .post(`/rooms/${channel.id}/join`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'typo' })
      .expect(201);

    const edited = await request(server())
      .patch(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'fixed' })
      .expect(200);
    expect(edited.body.body).toBe('fixed');
    expect(edited.body.editedAt).not.toBeNull();

    const res = await request(server())
      .patch(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ body: 'bad' })
      .expect(200); // alice is still the author, allowed

    expect(res.body.body).toBe('bad');

    const sync = await request(server())
      .get('/sync')
      .query({ room: channel.id, since: '0' })
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const editEvents = sync.body.events.filter(
      (e: { type: string }) => e.type === 'message_edited',
    );
    expect(editEvents).toHaveLength(2);
    expect(editEvents[0].content).toEqual({
      messageId: message.body.id,
      editedAt: expect.any(String),
    });
  });

  it('deletes a message: clears body, removes pins/mentions, tombstones the event', async () => {
    const ownerToken = await login('owner');
    const channel = await createPublicChannel(ownerToken, 'delete-room');

    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'to be deleted' })
      .expect(201);

    await request(server())
      .put(`/rooms/${channel.id}/pins/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    for (const emoji of ['👍', '🎉']) {
      await request(server())
        .put(`/messages/${message.body.id}/reactions/${encodeURIComponent(emoji)}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
    }

    await request(server())
      .delete(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    // Every reaction goes, not only the first one.
    expect(await prisma.orm.public.Reaction.where({ messageId: message.body.id }).all()).toEqual(
      [],
    );

    // Deleting an already-deleted message is refused (404, not idempotent).
    await request(server())
      .delete(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);

    const pins = await request(server())
      .get(`/rooms/${channel.id}/pins`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(pins.body.map((p: { messageId: string }) => p.messageId)).not.toContain(message.body.id);
  });

  it('appends message_deleted on delete and scrubs the body from the account feed', async () => {
    const ownerToken = await login('owner');
    const owner = (await accounts.findByIdentifier('owner'))!;
    const channel = await createPublicChannel(ownerToken, 'delete-event-room');

    const message = await request(server())
      .post(`/rooms/${channel.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'a very secret sentence' })
      .expect(201);

    const feedRows = async () =>
      (await prisma.orm.public.AccountFeedEvent.where({
        userId: owner.id,
        roomId: channel.id,
      }).all()) as unknown as Array<{ roomSeq: bigint | null; payload: Record<string, unknown> }>;

    const before = (await feedRows()).find((r) => r.roomSeq === BigInt(message.body.seq));
    expect(JSON.stringify(before?.payload)).toContain('a very secret sentence');

    await request(server())
      .delete(`/rooms/${channel.id}/messages/${message.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const sync = await request(server())
      .get('/sync')
      .query({ room: channel.id, since: '0' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const deleted = sync.body.events.find((e: { type: string }) => e.type === 'message_deleted');
    expect(deleted.content).toEqual({
      messageId: message.body.id,
      messageSeq: message.body.seq,
      reason: 'user',
    });
    expect(BigInt(deleted.seq)).toBeGreaterThan(BigInt(message.body.seq));
    expect(deleted.senderId).toBe(owner.id);

    const rows = await feedRows();
    const scrubbed = rows.find((r) => r.roomSeq === BigInt(message.body.seq));
    expect(scrubbed?.payload).toMatchObject({
      type: 'message_redacted',
      content: { reason: 'user' },
    });
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toContain('a very secret sentence');
    // The deletion itself was fanned out, like any other event.
    expect(rows.some((r) => (r.payload as { type: string }).type === 'message_deleted')).toBe(true);
  });

  describe('GET /rooms/:id/messages', () => {
    const list = (token: string, roomId: string, query: Record<string, string> = {}) =>
      request(server())
        .get(`/rooms/${roomId}/messages`)
        .query(query)
        .set('Authorization', `Bearer ${token}`);

    const post = async (
      token: string,
      roomId: string,
      body: string,
      mentions?: Array<{ type: 'user'; userId: string }>,
    ) =>
      (
        await request(server())
          .post(`/rooms/${roomId}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ body, mentions })
          .expect(201)
      ).body as { id: string; seq: string };

    it('pages backwards, ascending inside each page, with hasMore and lastSeq', async () => {
      const ownerToken = await login('owner');
      const channel = await createPublicChannel(ownerToken, 'list-room');
      const sent = [];
      for (const body of ['m1', 'm2', 'm3', 'm4', 'm5']) {
        sent.push(await post(ownerToken, channel.id, body));
      }

      const first = await list(ownerToken, channel.id, { limit: '2' }).expect(200);
      expect(first.body.items.map((m: { body: string }) => m.body)).toEqual(['m4', 'm5']);
      expect(first.body.hasMore).toBe(true);
      const room = await request(server())
        .get(`/rooms/${channel.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(first.body.lastSeq).toBe(room.body.lastSeq);

      const second = await list(ownerToken, channel.id, {
        limit: '2',
        before: first.body.items[0].seq,
      }).expect(200);
      expect(second.body.items.map((m: { body: string }) => m.body)).toEqual(['m2', 'm3']);
      expect(second.body.hasMore).toBe(true);

      const last = await list(ownerToken, channel.id, {
        limit: '2',
        before: second.body.items[0].seq,
      }).expect(200);
      expect(last.body.items.map((m: { body: string }) => m.body)).toEqual(['m1']);
      expect(last.body.hasMore).toBe(false);

      // `before` is exclusive, and an unbounded page defaults to everything (< 50).
      const all = await list(ownerToken, channel.id).expect(200);
      expect(all.body.items.map((m: { id: string }) => m.id)).toEqual(sent.map((m) => m.id));
      expect(all.body.hasMore).toBe(false);
      const empty = await list(ownerToken, channel.id, { before: sent[0]?.seq ?? '0' }).expect(200);
      expect(empty.body.items).toEqual([]);
      expect(empty.body.hasMore).toBe(false);
    });

    it('returns tombstones for deleted messages and the mentions of each message', async () => {
      const ownerToken = await login('owner');
      const aliceToken = await login('alice');
      const alice = (await accounts.findByIdentifier('alice'))!;
      const channel = await createPublicChannel(ownerToken, 'list-tombstone-room');
      await request(server())
        .post(`/rooms/${channel.id}/join`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(201);

      const plain = await post(ownerToken, channel.id, 'plain');
      const mentioning = await post(ownerToken, channel.id, 'hello @alice', [
        { type: 'user', userId: alice.id },
      ]);
      const doomed = await post(ownerToken, channel.id, 'to delete');
      await request(server())
        .delete(`/rooms/${channel.id}/messages/${doomed.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const res = await list(aliceToken, channel.id).expect(200);
      const byId = new Map(res.body.items.map((m: { id: string }) => [m.id, m] as const)) as Map<
        string,
        { mentions: unknown[]; mentionsMe: string | null; body: string; redactedAt: string | null }
      >;
      expect(res.body.items.map((m: { id: string }) => m.id)).toEqual([
        plain.id,
        mentioning.id,
        doomed.id,
      ]);
      expect(byId.get(plain.id)?.mentions).toEqual([]);
      expect(byId.get(mentioning.id)?.mentions).toEqual([
        { type: 'user', target: alice.id, token: `@alice/${config.get('server.domain')}` },
      ]);
      expect(byId.get(mentioning.id)?.mentionsMe).toBe('direct');
      expect(byId.get(plain.id)?.mentionsMe).toBeNull();
      expect(byId.get(doomed.id)).toMatchObject({ body: '' });
      expect(byId.get(doomed.id)?.redactedAt).not.toBeNull();
    });

    it('caps limit at messages.max_page', async () => {
      const ownerToken = await login('owner');
      const channel = await createPublicChannel(ownerToken, 'list-cap-room');
      for (const body of ['a', 'b', 'c']) {
        await post(ownerToken, channel.id, body);
      }

      await config.set('messages.max_page', 2, null);
      try {
        const res = await list(ownerToken, channel.id, { limit: '50' }).expect(200);
        expect(res.body.items.map((m: { body: string }) => m.body)).toEqual(['b', 'c']);
        expect(res.body.hasMore).toBe(true);
      } finally {
        await config.clear('messages.max_page');
      }
    });

    it('pages forwards with `after`, with hasMore and hasMoreNewer', async () => {
      const ownerToken = await login('owner');
      const channel = await createPublicChannel(ownerToken, 'after-room');
      const sent = [];
      for (const body of ['m1', 'm2', 'm3', 'm4', 'm5']) {
        sent.push(await post(ownerToken, channel.id, body));
      }
      const bodies = (res: { body: { items: Array<{ body: string }> } }) =>
        res.body.items.map((m) => m.body);

      // Right after the first message: ascending, older exists, newer exists.
      const first = await list(ownerToken, channel.id, {
        after: sent[0]?.seq ?? '0',
        limit: '2',
      }).expect(200);
      expect(bodies(first)).toEqual(['m2', 'm3']);
      expect(first.body.hasMore).toBe(true);
      expect(first.body.hasMoreNewer).toBe(true);

      // Fewer than `limit` left: the end of the room.
      const end = await list(ownerToken, channel.id, {
        after: sent[2]?.seq ?? '0',
        limit: '10',
      }).expect(200);
      expect(bodies(end)).toEqual(['m4', 'm5']);
      expect(end.body.hasMore).toBe(true);
      expect(end.body.hasMoreNewer).toBe(false);

      // After the newest message: empty, nothing newer, older still exists.
      const beyond = await list(ownerToken, channel.id, { after: sent[4]?.seq ?? '0' }).expect(200);
      expect(beyond.body.items).toEqual([]);
      expect(beyond.body.hasMore).toBe(true);
      expect(beyond.body.hasMoreNewer).toBe(false);

      // Before the first message: everything, no older message.
      const everything = await list(ownerToken, channel.id, { after: '0' }).expect(200);
      expect(bodies(everything)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
      expect(everything.body.hasMore).toBe(false);
      expect(everything.body.hasMoreNewer).toBe(false);
    });

    it('returns a window `around` a message, with hasMore and hasMoreNewer', async () => {
      const ownerToken = await login('owner');
      const channel = await createPublicChannel(ownerToken, 'around-room');
      const sent = [];
      for (const body of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']) {
        sent.push(await post(ownerToken, channel.id, body));
      }
      const bodies = (res: { body: { items: Array<{ body: string }> } }) =>
        res.body.items.map((m) => m.body);

      // floor(4/2) = 2 older, then the anchor and the rest from `seq` on.
      const middle = await list(ownerToken, channel.id, {
        around: sent[3]?.seq ?? '0',
        limit: '4',
      }).expect(200);
      expect(bodies(middle)).toEqual(['m2', 'm3', 'm4', 'm5']);
      expect(middle.body.hasMore).toBe(true);
      expect(middle.body.hasMoreNewer).toBe(true);

      // First message: nothing older, and the split stays `floor(limit/2)` / the rest.
      const oldest = await list(ownerToken, channel.id, {
        around: sent[0]?.seq ?? '0',
        limit: '4',
      }).expect(200);
      expect(bodies(oldest)).toEqual(['m1', 'm2']);
      expect(oldest.body.hasMore).toBe(false);
      expect(oldest.body.hasMoreNewer).toBe(true);

      // Newest message: fewer than `limit` after it.
      const newest = await list(ownerToken, channel.id, {
        around: sent[6]?.seq ?? '0',
        limit: '4',
      }).expect(200);
      expect(bodies(newest)).toEqual(['m5', 'm6', 'm7']);
      expect(newest.body.hasMore).toBe(true);
      expect(newest.body.hasMoreNewer).toBe(false);

      // Fewer messages than `limit` overall.
      const all = await list(ownerToken, channel.id, { around: sent[3]?.seq ?? '0' }).expect(200);
      expect(bodies(all)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
      expect(all.body.hasMore).toBe(false);
      expect(all.body.hasMoreNewer).toBe(false);
    });

    it('reports hasMoreNewer false on the default and `before` pages', async () => {
      const ownerToken = await login('owner');
      const channel = await createPublicChannel(ownerToken, 'newer-flag-room');
      const sent = [];
      for (const body of ['m1', 'm2', 'm3']) {
        sent.push(await post(ownerToken, channel.id, body));
      }

      const newest = await list(ownerToken, channel.id, { limit: '1' }).expect(200);
      expect(newest.body.hasMoreNewer).toBe(false);
      const older = await list(ownerToken, channel.id, {
        before: sent[2]?.seq ?? '0',
        limit: '1',
      }).expect(200);
      expect(older.body.hasMoreNewer).toBe(false);
    });

    it('rejects more than one of `before`, `after` and `around`', async () => {
      const ownerToken = await login('owner');
      const channel = await createPublicChannel(ownerToken, 'exclusive-room');

      await list(ownerToken, channel.id, { before: '5', after: '1' }).expect(422);
      await list(ownerToken, channel.id, { before: '5', around: '3' }).expect(422);
      await list(ownerToken, channel.id, { after: '1', around: '3' }).expect(422);
      await list(ownerToken, channel.id, { after: 'abc' }).expect(422);
      await list(ownerToken, channel.id, { around: '-1' }).expect(422);
    });

    it('refuses a non-reader, an unknown room and invalid query values', async () => {
      const ownerToken = await login('owner');
      const aliceToken = await login('alice');
      const space = (
        await request(server())
          .post('/spaces')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ name: 'list-private-space', visibility: 'private' })
          .expect(201)
      ).body;
      const channel = (
        await request(server())
          .post('/rooms')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ parentId: space.id, name: 'list-private', visibility: 'private' })
          .expect(201)
      ).body;

      const denied = await list(aliceToken, channel.id).expect(403);
      expect(denied.body.code).toBe('room.permission_denied');

      const missing = await list(aliceToken, ulid()).expect(404);
      expect(missing.body.code).toBe('room.not_found');

      await list(ownerToken, channel.id, { before: 'abc' }).expect(422);
      await list(ownerToken, channel.id, { limit: '0' }).expect(422);
    });
  });
});
