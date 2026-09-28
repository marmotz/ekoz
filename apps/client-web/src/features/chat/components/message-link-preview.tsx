import type { LinkPreviewView } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import { LinkPreviewCard } from '@/features/chat/components/link-preview-card';
import { replaceMessage, type Timeline, toTimelineMessage } from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useSdk } from '@/shared/sdk/use-sdk';

export interface MessageLinkPreviewProps {
  roomId: string;
  messageId: string;
  authorId: string | null;
  linkPreview: LinkPreviewView;
  /** The caller's account id, so only the author gets the remove button. */
  myId: string | null;
}

/** A message's link preview card, removable by its author (technical.md §6). */
export function MessageLinkPreview({
  roomId,
  messageId,
  authorId,
  linkPreview,
  myId,
}: MessageLinkPreviewProps) {
  const { t } = useTranslation();
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState(false);
  const canRemove = myId !== null && authorId === myId;

  const remove = async () => {
    if (!sdk || removing) return;
    setRemoving(true);
    try {
      const message = await sdk.messages.edit(roomId, messageId, { linkPreviewUrl: null });
      queryClient.setQueryData<Timeline>(chatKeys.timeline(roomId), (current) =>
        current ? replaceMessage(current, toTimelineMessage(message)) : current,
      );
    } catch {
      // The edit is picked up the next time the room is opened.
    } finally {
      setRemoving(false);
    }
  };

  return (
    <LinkPreviewCard
      preview={linkPreview}
      imageRef={{ kind: 'message_preview', messageId }}
      onRemove={canRemove ? () => void remove() : undefined}
      removeLabel={t('chat.linkPreview.remove')}
    />
  );
}
