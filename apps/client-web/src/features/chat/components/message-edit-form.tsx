import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import { type ComposerMessage, MessageEditor } from '@/features/chat/components/message-editor';
import { toFailureReason } from '@/features/chat/hooks/use-send-message';
import { toMentionInputs } from '@/features/chat/lib/mention-node';
import {
  replaceMessage,
  type SendFailureReason,
  type Timeline,
  type TimelineMessage,
  toTimelineMessage,
} from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useSdk } from '@/shared/sdk/use-sdk';
import { Button } from '@/shared/ui/button';

const ERROR_KEYS = {
  read_only: 'chat.edit.errors.permissionDenied',
  permission_denied: 'chat.edit.errors.permissionDenied',
  body_too_long: 'chat.edit.errors.bodyTooLong',
  body_invalid: 'chat.edit.errors.bodyInvalid',
  mention_invalid: 'chat.edit.errors.mentionInvalid',
  not_found: 'chat.edit.errors.notFound',
  network: 'chat.edit.errors.network',
  unknown: 'chat.edit.errors.generic',
} as const satisfies Record<SendFailureReason, string>;

export interface MessageEditFormProps {
  message: TimelineMessage;
  allowCollective: boolean;
  /** Saved, cancelled, or the message is gone: the row goes back to its body. */
  onFinished: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

/**
 * Inline edit of a message: the shared composer editor loaded with the body, Enter or
 * Save to save, Escape or Cancel to leave. An unchanged body cancels without a request
 * (the server would set a spurious `editedAt`); an empty one cannot be saved. An error
 * keeps the editor open with the reason, except `message.not_found`, which closes it.
 */
export function MessageEditForm({
  message,
  allowCollective,
  onFinished,
  onDirtyChange,
}: MessageEditFormProps) {
  const { t } = useTranslation();
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ saving: boolean; error: SendFailureReason | null }>({
    saving: false,
    error: null,
  });

  const save = async ({ body, mentions }: ComposerMessage) => {
    if (!sdk) return;
    setState({ saving: true, error: null });
    try {
      const edited = await sdk.messages.edit(message.roomId, message.id, {
        body,
        mentions: toMentionInputs(mentions),
      });
      queryClient.setQueryData<Timeline>(chatKeys.timeline(message.roomId), (current) =>
        current ? replaceMessage(current, toTimelineMessage(edited)) : current,
      );
      onFinished();
    } catch (error) {
      const reason = toFailureReason(error);
      if (reason === 'body_too_long') {
        void queryClient.invalidateQueries({ queryKey: chatKeys.messagesPolicy() });
      }
      setState({ saving: false, error: reason });
      if (reason === 'not_found') onFinished();
    }
  };

  return (
    <div className="mt-1" data-testid="message-edit-form">
      <MessageEditor
        roomId={message.roomId}
        allowCollective={allowCollective}
        disabled={state.saving}
        initial={{ body: message.body, mentions: message.mentions }}
        label={t('chat.edit.label')}
        onSubmit={(edited) => void save(edited)}
        onUnchanged={onFinished}
        onCancel={onFinished}
        onDirtyChange={onDirtyChange}
      >
        {({ canSubmit, submit }) => (
          <div className="flex flex-col gap-1">
            <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
              {t('chat.edit.save')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onFinished}>
              {t('chat.edit.cancel')}
            </Button>
          </div>
        )}
      </MessageEditor>
      {state.error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {t(ERROR_KEYS[state.error])}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">{t('chat.edit.hint')}</p>
    </div>
  );
}
