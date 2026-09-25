import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { UserSummaryReader } from '../../../core/users/user-summary.reader.js';
import {
  MessageMentionInvalidError,
  MessageMentionNotMemberError,
} from '../conversations.errors.js';
import { EffectiveMembersQuery } from '../membership/effective-members.query.js';
import {
  dedupeMentions,
  inputTarget,
  type MentionInput,
  type MentionType,
} from './mention.types.js';

export interface ResolveMentionsInput {
  roomId: string;
  roomType: string;
  authorId: string;
  mentions: readonly MentionInput[];
}

export interface ResolvedMention {
  type: MentionType;
  /** The userId, role name or groupId; "" for `all`. */
  target: string;
  /** The body text standing for the target, frozen from now on. */
  token: string;
  /** Who the target concerns, frozen from now on; never contains the author. */
  audience: string[];
}

/**
 * Turns the mention targets a client sent into frozen tokens and audiences
 * (web-client-mentions technical.md S2). Duplicates collapse; the order of the
 * first occurrences is kept. The body is never checked for the tokens.
 */
@Injectable()
export class MentionResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectiveMembers: EffectiveMembersQuery,
    private readonly userSummaries: UserSummaryReader,
  ) {}

  async resolve(input: ResolveMentionsInput): Promise<ResolvedMention[]> {
    const mentions = dedupeMentions(input.mentions);
    if (mentions.length === 0) {
      return [];
    }
    if (input.roomType !== 'channel' && mentions.some((mention) => mention.type !== 'user')) {
      throw new MessageMentionInvalidError(
        '"all", role and group mentions are only allowed in channels.',
      );
    }

    const members = await this.effectiveMembers.listAll(input.roomId);
    const memberIds = new Set(members.map((member) => member.userId));

    const identifiers = await this.userIdentifiers(mentions, memberIds);
    const groups = await this.visibleGroups(input.roomId, mentions);

    const withoutAuthor = (userIds: readonly string[]) =>
      userIds.filter((userId) => userId !== input.authorId);

    const resolved: ResolvedMention[] = [];
    for (const mention of mentions) {
      switch (mention.type) {
        case 'user':
          resolved.push({
            type: 'user',
            target: mention.userId,
            token: `@${identifiers.get(mention.userId)}`,
            audience: withoutAuthor([mention.userId]),
          });
          break;
        case 'all':
          resolved.push({
            type: 'all',
            target: '',
            token: '@all',
            audience: withoutAuthor(members.map((member) => member.userId)),
          });
          break;
        case 'role':
          resolved.push({
            type: 'role',
            target: mention.role,
            token: `@${mention.role}`,
            audience: withoutAuthor(
              members.filter((member) => member.role === mention.role).map((m) => m.userId),
            ),
          });
          break;
        case 'group': {
          const group = groups.get(mention.groupId);
          if (!group) {
            throw new MessageMentionInvalidError(
              'A mentioned group is not available in this room.',
            );
          }
          resolved.push({
            type: 'group',
            target: group.id,
            token: `@${group.name}`,
            audience: withoutAuthor(group.memberIds.filter((userId) => memberIds.has(userId))),
          });
          break;
        }
      }
    }

    return resolved;
  }

  /** `userId` -> canonical identifier, for every `user` target; each must be an effective member. */
  private async userIdentifiers(
    mentions: readonly MentionInput[],
    memberIds: ReadonlySet<string>,
  ): Promise<Map<string, string>> {
    const userIds = mentions.flatMap((mention) =>
      mention.type === 'user' ? [mention.userId] : [],
    );
    if (userIds.some((userId) => !memberIds.has(userId))) {
      throw new MessageMentionNotMemberError();
    }
    const summaries = await this.userSummaries.readMany(userIds);

    return new Map(
      userIds.map((userId) => {
        const identifier = summaries.get(userId)?.identifier;
        if (!identifier) {
          throw new MessageMentionInvalidError('A mentioned user has no identifier to mention.');
        }

        return [userId, identifier];
      }),
    );
  }

  /** The `group` targets that are defined on the room or one of its ancestors, with their members. */
  private async visibleGroups(
    roomId: string,
    mentions: readonly MentionInput[],
  ): Promise<Map<string, { id: string; name: string; memberIds: string[] }>> {
    const groupIds = mentions.flatMap((mention) =>
      mention.type === 'group' ? [inputTarget(mention)] : [],
    );
    if (groupIds.length === 0) {
      return new Map();
    }

    const closure = (await this.prisma.orm.public.RoomClosure.where({
      descendantId: roomId,
    }).all()) as Array<{ ancestorId: string }>;
    const nodeIds = new Set([roomId, ...closure.map((row) => row.ancestorId)]);

    const groups = (await this.prisma.orm.public.RoomGroup.where((f) =>
      f.id.in(groupIds),
    ).all()) as Array<{ id: string; nodeId: string; name: string }>;
    const visible = groups.filter((group) => nodeIds.has(group.nodeId));
    if (visible.length === 0) {
      return new Map();
    }

    const members = (await this.prisma.orm.public.RoomGroupMember.where((f) =>
      f.groupId.in(visible.map((group) => group.id)),
    ).all()) as Array<{ groupId: string; userId: string }>;

    return new Map(
      visible.map((group) => [
        group.id,
        {
          id: group.id,
          name: group.name,
          memberIds: members.filter((m) => m.groupId === group.id).map((m) => m.userId),
        },
      ]),
    );
  }
}
