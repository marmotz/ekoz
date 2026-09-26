import { EkozError, NetworkError } from '@ekozhq/sdk';
import { useQueryClient } from '@tanstack/react-query';
import type { ParseKeys } from 'i18next';
import { useState } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import { removePinLocally } from '@/features/chat/hooks/use-pins';
import { redactLocally, type Timeline, type TimelineMessage } from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { MessageBody } from '@/shared/messages/message-body';
import { useSdk } from '@/shared/sdk/use-sdk';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

const ERROR_KEYS: Record<string, ParseKeys> = {
  'room.permission_denied': 'chat.delete.errors.permissionDenied',
  'message.not_found': 'chat.delete.errors.notFound',
};

function errorKey(error: unknown): ParseKeys {
  if (error instanceof NetworkError) return 'chat.delete.errors.network';
  if (error instanceof EkozError) return ERROR_KEYS[error.code] ?? 'chat.delete.errors.generic';
  return 'chat.delete.errors.generic';
}

export interface DeleteMessageDialogProps {
  /** The message to delete; the dialog is open while it is set. */
  message: TimelineMessage | null;
  onClose: () => void;
}

/**
 * Confirms the deletion of a message. On success the message becomes a tombstone at once
 * (idempotent with the `message_deleted` echo); an error stays in the dialog. A refused
 * delete must not flash a tombstone, so nothing is changed before the answer.
 */
export function DeleteMessageDialog({ message, onClose }: DeleteMessageDialogProps) {
  const { t } = useTranslation();
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ status: 'idle' | 'deleting' | 'error'; error?: ParseKeys }>({
    status: 'idle',
  });

  const close = () => {
    setState({ status: 'idle' });
    onClose();
  };

  const confirm = async () => {
    if (!sdk || !message) return;
    setState({ status: 'deleting' });
    try {
      await sdk.messages.delete(message.roomId, message.id);
    } catch (error) {
      setState({ status: 'error', error: errorKey(error) });
      return;
    }
    queryClient.setQueryData<Timeline>(chatKeys.timeline(message.roomId), (current) =>
      current ? redactLocally(current, message.id, new Date().toISOString()) : current,
    );
    removePinLocally(queryClient, message.roomId, { messageId: message.id });
    close();
  };

  return (
    <Dialog open={message !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chat.delete.title')}</DialogTitle>
          <DialogDescription>{t('chat.delete.description')}</DialogDescription>
        </DialogHeader>
        {message ? (
          <blockquote className="border-l-2 pl-3 text-muted-foreground">
            <MessageBody
              body={message.body}
              roomId={message.roomId}
              mentions={message.mentions}
              compact
            />
          </blockquote>
        ) : null}
        {state.status === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            {t(state.error ?? 'chat.delete.errors.generic')}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t('chat.delete.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={state.status === 'deleting'}
            onClick={() => void confirm()}
          >
            {t('chat.delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
