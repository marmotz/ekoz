import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { nullableString } from '../../../core/http/nullable.js';
import { roomRoleSchema } from '../rooms/room.view.js';

export const MENTION_TYPES = ['user', 'all', 'role', 'group'] as const;
export type MentionType = (typeof MENTION_TYPES)[number];

/** What a client sends: the target, never the token (the server freezes it). */
export const MentionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), userId: entityIdSchema }),
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('role'), role: roomRoleSchema }),
  z.object({ type: z.literal('group'), groupId: entityIdSchema }),
]);
export type MentionInput = z.infer<typeof MentionInputSchema>;

/** What the API returns for a target: `target` is `null` for `all`. */
export const MentionTargetSchema = z.object({
  type: z.enum(MENTION_TYPES),
  target: nullableString(),
  token: z.string(),
});
export type MentionTarget = z.infer<typeof MentionTargetSchema>;
export class MentionTargetDto extends createZodDto(MentionTargetSchema) {}

/** Whether a message concerns the viewer through a `user` target or a collective one. */
export const MentionsMeSchema = z.enum(['direct', 'collective']);
export type MentionsMe = z.infer<typeof MentionsMeSchema>;

/** The stored `target` column: the userId, role name or groupId, "" for `all`. */
export function inputTarget(input: MentionInput): string {
  switch (input.type) {
    case 'user':
      return input.userId;
    case 'role':
      return input.role;
    case 'group':
      return input.groupId;
    case 'all':
      return '';
  }
}

export function mentionKey(type: string, target: string): string {
  return `${type}:${target}`;
}

/** Collapse duplicate targets, keeping the first occurrence. */
export function dedupeMentions(inputs: readonly MentionInput[]): MentionInput[] {
  const seen = new Set<string>();

  return inputs.filter((input) => {
    const key = mentionKey(input.type, inputTarget(input));
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);

    return true;
  });
}

export interface MentionTargetRow {
  messageId: string;
  type: MentionType;
  target: string;
  token: string;
  position: number;
}

export function toMentionTarget(
  row: Pick<MentionTargetRow, 'type' | 'target' | 'token'>,
): MentionTarget {
  return { type: row.type, target: row.type === 'all' ? null : row.target, token: row.token };
}
