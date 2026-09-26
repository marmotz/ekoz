import { EkozError } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import { type Timeline, toggleReactionLocally } from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useMe } from '@/shared/sdk/use-me';
import { useSdk } from '@/shared/sdk/use-sdk';
import { toast } from '@/shared/ui/sonner';

export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof EkozError && error.code === code;
}

/**
 * The server-side actions of a message that need no dialog: reactions (optimistic) and
 * pins. A conflict that already describes the wanted state counts as success.
 */
export function useMessageActions(roomId: string) {
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const myId = useMe().data?.id ?? null;
  const timelineKey = chatKeys.timeline(roomId);

  const updateTimeline = useCallback(
    (change: (timeline: Timeline) => Timeline) => {
      queryClient.setQueryData<Timeline>(timelineKey, (current) =>
        current ? change(current) : current,
      );
    },
    [queryClient, timelineKey],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!sdk || myId === null) return;
      const message = queryClient
        .getQueryData<Timeline>(timelineKey)
        ?.messages.find((candidate) => candidate.id === messageId);
      if (!message) return;

      const on = !message.reactions
        .find((reaction) => reaction.emoji === emoji)
        ?.userIds.includes(myId);
      updateTimeline((timeline) => toggleReactionLocally(timeline, messageId, emoji, myId, on));
      try {
        if (on) await sdk.messages.react(messageId, emoji);
        else await sdk.messages.unreact(messageId, emoji);
      } catch (error) {
        const alreadyDone = hasErrorCode(
          error,
          on ? 'message.reaction_already_exists' : 'message.reaction_not_found',
        );
        if (alreadyDone) return;
        updateTimeline((timeline) => toggleReactionLocally(timeline, messageId, emoji, myId, !on));
        toast.error(t('chat.reactions.failed'));
      }
    },
    [sdk, myId, queryClient, timelineKey, updateTimeline, t],
  );

  const setPinned = useCallback(
    async (messageId: string, pinned: boolean) => {
      if (!sdk) return;
      try {
        if (pinned) await sdk.messages.pin(roomId, messageId);
        else await sdk.messages.unpin(roomId, messageId);
      } catch (error) {
        const alreadyDone = hasErrorCode(
          error,
          pinned ? 'message.already_pinned' : 'message.not_pinned',
        );
        if (!alreadyDone) {
          toast.error(t(pinned ? 'chat.pins.pinFailed' : 'chat.pins.unpinFailed'));
          return;
        }
      }
      // The stream echoes it too; this keeps the indicator right without waiting for it.
      void queryClient.invalidateQueries({ queryKey: chatKeys.pins(roomId) });
    },
    [sdk, roomId, queryClient, t],
  );

  return { toggleReaction, setPinned, updateTimeline };
}
