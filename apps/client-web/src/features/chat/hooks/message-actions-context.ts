import { createContext, useContext } from 'react';

import type { TimelineMessage } from '@/features/chat/lib/timeline';

/**
 * What a message row needs to offer and run the actions of a message (technical design
 * C2 to C7), provided by `RoomChat`. Absent outside a room chat: a row then shows no
 * menu, no reaction chip and no quote jump.
 */
export interface MessageActionsValue {
  roomId: string;
  /** Whether `@all`, roles and groups can be mentioned while editing (channels only). */
  allowCollective: boolean;
  myId: string | null;
  capabilities: readonly string[];
  /** The composer is not blocked. */
  canPost: boolean;
  /** The client clock in milliseconds, refreshed while there is an edit window to compare it with. */
  now: number;
  /** `messages.edit_window` in seconds; `null` or unknown means unlimited. */
  editWindow: number | null | undefined;
  /** Ids of the pinned messages of the room. */
  pinnedIds: ReadonlySet<string>;
  /** The message being edited inline, if any. */
  editingId: string | null;
  onReply: (message: TimelineMessage) => void;
  onEdit: (message: TimelineMessage) => void;
  onDelete: (message: TimelineMessage) => void;
  onPin: (message: TimelineMessage) => void;
  onUnpin: (message: TimelineMessage) => void;
  /** Adds the caller's reaction, or removes it when already there. */
  onToggleReaction: (message: TimelineMessage, emoji: string) => void;
  /** The inline editor saved, was cancelled or lost its message. */
  onEditFinished: () => void;
  onEditDirtyChange: (dirty: boolean) => void;
  /** Scrolls to a message of the room, loading its window when it is not in the timeline. */
  onJumpToMessage: (messageId: string) => void;
}

export const MessageActionsContext = createContext<MessageActionsValue | null>(null);

export function useMessageActionsContext(): MessageActionsValue | null {
  return useContext(MessageActionsContext);
}
