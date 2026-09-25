import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { UserSummaryReader } from '../../../core/users/user-summary.reader.js';
import {
  MessageMentionInvalidError,
  MessageMentionNotMemberError,
} from '../conversations.errors.js';
import type { EffectiveMembersQuery } from '../membership/effective-members.query.js';
import { dedupeMentions } from './mention.types.js';
import { MentionResolver } from './mention-resolver.js';

const AUTHOR = 'author';
const ALICE = 'alice';
const BOB = 'bob';
const CAROL = 'carol';
const OUTSIDER = 'outsider';

interface Fixture {
  members?: Array<{ userId: string; role: string }>;
  ancestors?: string[];
  groups?: Array<{ id: string; nodeId: string; name: string }>;
  groupMembers?: Array<{ groupId: string; userId: string }>;
}

function resolverFor(fixture: Fixture = {}): MentionResolver {
  const members = fixture.members ?? [
    { userId: AUTHOR, role: 'member' },
    { userId: ALICE, role: 'member' },
    { userId: BOB, role: 'moderator' },
    { userId: CAROL, role: 'room_admin' },
  ];
  const rows = (all: unknown[]) => ({ where: () => ({ all: async () => all }) });
  const prisma = {
    orm: {
      public: {
        RoomClosure: rows((fixture.ancestors ?? []).map((ancestorId) => ({ ancestorId }))),
        RoomGroup: rows(fixture.groups ?? []),
        RoomGroupMember: rows(fixture.groupMembers ?? []),
      },
    },
  } as unknown as PrismaService;
  const effectiveMembers = { listAll: async () => members } as unknown as EffectiveMembersQuery;
  const userSummaries = {
    readMany: async (ids: string[]) =>
      new Map(ids.map((id) => [id, { id, identifier: `${id}/ekoz.test` }])),
  } as unknown as UserSummaryReader;

  return new MentionResolver(prisma, effectiveMembers, userSummaries);
}

const base = { roomId: 'room', roomType: 'channel', authorId: AUTHOR } as const;

describe('MentionResolver (unit)', () => {
  it('resolves nothing for an empty list', async () => {
    expect(await resolverFor().resolve({ ...base, mentions: [] })).toEqual([]);
  });

  it('resolves a user target to the identifier token and that user only', async () => {
    const [resolved] = await resolverFor().resolve({
      ...base,
      mentions: [{ type: 'user', userId: ALICE }],
    });

    expect(resolved).toEqual({
      type: 'user',
      target: ALICE,
      token: '@alice/ekoz.test',
      audience: [ALICE],
    });
  });

  it('refuses a user who is not an effective member', async () => {
    await expect(
      resolverFor().resolve({ ...base, mentions: [{ type: 'user', userId: OUTSIDER }] }),
    ).rejects.toBeInstanceOf(MessageMentionNotMemberError);
  });

  it('resolves `all` to every effective member but the author', async () => {
    const [resolved] = await resolverFor().resolve({ ...base, mentions: [{ type: 'all' }] });

    expect(resolved).toMatchObject({ type: 'all', target: '', token: '@all' });
    expect(resolved?.audience.sort()).toEqual([ALICE, BOB, CAROL]);
  });

  it('resolves a role to the members holding it as their effective role', async () => {
    const [resolved] = await resolverFor().resolve({
      ...base,
      mentions: [{ type: 'role', role: 'moderator' }],
    });

    expect(resolved).toEqual({
      type: 'role',
      target: 'moderator',
      token: '@moderator',
      audience: [BOB],
    });
  });

  it('resolves a group on the room to its members that are still effective members', async () => {
    const [resolved] = await resolverFor({
      groups: [{ id: 'g1', nodeId: 'room', name: 'devs' }],
      groupMembers: [
        { groupId: 'g1', userId: ALICE },
        { groupId: 'g1', userId: OUTSIDER },
        { groupId: 'g1', userId: AUTHOR },
      ],
    }).resolve({ ...base, mentions: [{ type: 'group', groupId: 'g1' }] });

    expect(resolved).toEqual({ type: 'group', target: 'g1', token: '@devs', audience: [ALICE] });
  });

  it('accepts a group defined on an ancestor and refuses one defined elsewhere', async () => {
    const fixture = {
      ancestors: ['space'],
      groups: [
        { id: 'up', nodeId: 'space', name: 'up' },
        { id: 'elsewhere', nodeId: 'other-room', name: 'elsewhere' },
      ],
      groupMembers: [{ groupId: 'up', userId: BOB }],
    };

    const [resolved] = await resolverFor(fixture).resolve({
      ...base,
      mentions: [{ type: 'group', groupId: 'up' }],
    });
    expect(resolved?.audience).toEqual([BOB]);

    await expect(
      resolverFor(fixture).resolve({
        ...base,
        mentions: [{ type: 'group', groupId: 'elsewhere' }],
      }),
    ).rejects.toBeInstanceOf(MessageMentionInvalidError);
    await expect(
      resolverFor(fixture).resolve({ ...base, mentions: [{ type: 'group', groupId: 'missing' }] }),
    ).rejects.toBeInstanceOf(MessageMentionInvalidError);
  });

  it.each(['dm', 'group_dm', 'space'])('refuses collective targets in a %s', async (roomType) => {
    const resolver = resolverFor();
    for (const mention of [
      { type: 'all' },
      { type: 'role', role: 'member' },
      { type: 'group', groupId: 'g1' },
    ] as const) {
      await expect(
        resolver.resolve({ ...base, roomType, mentions: [mention] }),
      ).rejects.toBeInstanceOf(MessageMentionInvalidError);
    }

    // A user target is still fine.
    await expect(
      resolver.resolve({ ...base, roomType, mentions: [{ type: 'user', userId: ALICE }] }),
    ).resolves.toHaveLength(1);
  });

  it('keeps the author as a target but never in the audience', async () => {
    const [resolved] = await resolverFor().resolve({
      ...base,
      mentions: [{ type: 'user', userId: AUTHOR }],
    });

    expect(resolved).toMatchObject({ type: 'user', target: AUTHOR, audience: [] });
  });

  it('collapses duplicates and keeps the order of first use', async () => {
    const resolved = await resolverFor().resolve({
      ...base,
      mentions: [
        { type: 'user', userId: BOB },
        { type: 'all' },
        { type: 'user', userId: BOB },
        { type: 'all' },
        { type: 'user', userId: ALICE },
      ],
    });

    expect(resolved.map((r) => `${r.type}:${r.target}`)).toEqual([
      'user:bob',
      'all:',
      'user:alice',
    ]);
  });

  it('freezes the audience it computed: a later membership change does not touch the result', async () => {
    const members = [
      { userId: AUTHOR, role: 'member' },
      { userId: ALICE, role: 'member' },
    ];
    const resolver = resolverFor({ members });
    const [resolved] = await resolver.resolve({ ...base, mentions: [{ type: 'all' }] });
    members.push({ userId: BOB, role: 'member' });

    expect(resolved?.audience).toEqual([ALICE]);
  });
});

describe('dedupeMentions (unit)', () => {
  it('treats the same type and target as one, and different roles as different', () => {
    expect(
      dedupeMentions([
        { type: 'role', role: 'member' },
        { type: 'role', role: 'reader' },
        { type: 'role', role: 'member' },
      ]),
    ).toEqual([
      { type: 'role', role: 'member' },
      { type: 'role', role: 'reader' },
    ]);
  });
});
