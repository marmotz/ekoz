import type { TimelineMessage } from '@/features/chat/lib/timeline';

/** What can be done to a message, in the order the menus list them. */
export const MESSAGE_ACTIONS = ['reply', 'react', 'edit', 'pin', 'unpin', 'delete'] as const;

export type MessageAction = (typeof MESSAGE_ACTIONS)[number];

export interface AvailableActionsInput {
  message: TimelineMessage;
  /** The caller's account id, or `null` while it is unknown. */
  myId: string | null;
  capabilities: readonly string[];
  /** `messages.edit_window` in seconds; `null` (or unknown) means unlimited. */
  editWindow: number | null | undefined;
  /** The client clock, in milliseconds. */
  now: number;
  /** The composer is not blocked (`composerBlock(...) === null`). */
  canPost: boolean;
  /** The message is in the room's pins. */
  pinned?: boolean;
}

/** True while the author may still edit: no window, or the message is younger than it. */
export function insideEditWindow(
  createdAt: string,
  editWindow: number | null | undefined,
  now: number,
): boolean {
  if (editWindow === null || editWindow === undefined) return true;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true;
  return created + editWindow * 1000 >= now;
}

/**
 * The actions to offer on a message (web-client-message-actions technical design C2).
 * The server stays the arbiter: this only hides what would be refused, and the
 * edit window is compared against the client clock.
 */
export function availableActions({
  message,
  myId,
  capabilities,
  editWindow,
  now,
  canPost,
  pinned = false,
}: AvailableActionsInput): MessageAction[] {
  if (message.redactedAt !== null || message.hiddenAt !== null) return [];

  const can = (capability: string) => capabilities.includes(capability);
  const own = myId !== null && message.authorId === myId;
  const actions = new Set<MessageAction>();

  if (canPost) actions.add('reply');
  if (can('room.react')) actions.add('react');
  if (
    (own && can('room.edit_own') && insideEditWindow(message.createdAt, editWindow, now)) ||
    can('room.edit_any')
  ) {
    actions.add('edit');
  }
  if (can('room.pin')) actions.add(pinned ? 'unpin' : 'pin');
  if ((own && can('room.delete_own')) || can('room.delete_any')) actions.add('delete');

  return MESSAGE_ACTIONS.filter((action) => actions.has(action));
}
