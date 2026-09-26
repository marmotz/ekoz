import type { ConversationListItem, Room } from '@ekozhq/sdk';

/** How many participant names a group without a name lists before `+N`. */
export const NAMED_PARTICIPANTS_SHOWN = 3;

type Participant = ConversationListItem['participants'][number];

/** A participant's label: their display name, else their identifier, else `unknown`. */
export function participantName(participant: Participant, unknown: string): string {
  return participant.user.displayName ?? participant.user.identifier ?? unknown;
}

/**
 * The name to show for a conversation: the other person for a `dm`; for a group its name,
 * else its participants (the first few, then `+N`). `unknown` stands in when there is
 * nobody to name (a conversation only known through `GET /rooms/:id`).
 */
export function conversationDisplayName(
  conversation: Pick<Room, 'type' | 'name'> & { participants?: Participant[] | undefined },
  unknown: string,
): string {
  const participants = conversation.participants ?? [];
  if (conversation.type === 'dm') {
    const other = participants[0];
    return other ? participantName(other, unknown) : unknown;
  }
  if (conversation.name) return conversation.name;
  if (participants.length === 0) return unknown;

  const shown = participants
    .slice(0, NAMED_PARTICIPANTS_SHOWN)
    .map((participant) => participantName(participant, unknown));
  const hidden = participants.length - shown.length;
  return hidden > 0 ? `${shown.join(', ')} +${hidden}` : shown.join(', ');
}
