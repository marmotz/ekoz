import { useQueryClient } from '@tanstack/react-query';
import { Paperclip, RotateCcw, X } from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';

import { chatKeys } from '@/features/chat/api/query-keys';
import { ComposerAttachments } from '@/features/chat/components/composer-attachments';
import { LinkPreviewCard } from '@/features/chat/components/link-preview-card';
import { type ComposerMessage, MessageEditor } from '@/features/chat/components/message-editor';
import { useComposerUploads } from '@/features/chat/hooks/use-composer-uploads';
import { useLinkPreview } from '@/features/chat/hooks/use-link-preview';
import { toFailureReason } from '@/features/chat/hooks/use-send-message';
import { toMentionInputs } from '@/features/chat/lib/mention-node';
import {
  replaceMessage,
  type SendFailureReason,
  type Timeline,
  type TimelineMessage,
  toTimelineMessage,
} from '@/features/chat/lib/timeline';
import { useAuthPolicy } from '@/shared/auth/use-auth-policy';
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
  /** Whether new files can be attached (author only, `room.attach`); existing ones can still be removed. */
  canAttach?: boolean;
  /** Saved, cancelled, or the message is gone: the row goes back to its body. */
  onFinished: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

/**
 * Inline edit of a message: the shared composer editor loaded with the body, Enter or
 * Save to save, Escape or Cancel to leave. An unchanged body cancels without a request
 * (the server would set a spurious `editedAt`); an empty one cannot be saved unless an
 * attachment covers it. An error keeps the editor open with the reason, except
 * `message.not_found`, which closes it. Existing attachments toggle out for removal
 * (still allowed under `room.edit_own`/`room.edit_any`); new ones need `room.attach` and
 * are author-only. The link preview follows whatever link the edited body still carries.
 */
export function MessageEditForm({
  message,
  allowCollective,
  canAttach = false,
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
  const uploads = useComposerUploads();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftBody, setDraftBody] = useState(message.body);
  const authPolicy = useAuthPolicy();
  const linkPreview = useLinkPreview(draftBody, authPolicy.data?.linkPreviews ?? false);
  const [keptAttachmentIds, setKeptAttachmentIds] = useState(
    () => new Set(message.attachments.map((attachment) => attachment.id)),
  );

  const toggleKept = (id: string) => {
    setKeptAttachmentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasAnyAttachment =
    keptAttachmentIds.size > 0 || uploads.entries.some((entry) => entry.state === 'ready');
  const originalLinkPreviewUrl = message.linkPreview?.url ?? null;
  // Whether saving is still needed although the body text itself is unchanged (`dirty` in
  // `MessageEditor` only tracks the text): an attachment or the link preview changed too.
  const hasNonBodyChanges =
    keptAttachmentIds.size !== message.attachments.length ||
    uploads.readyIds.length > 0 ||
    linkPreview.chosenUrl !== originalLinkPreviewUrl;

  const save = async ({ body, mentions }: ComposerMessage) => {
    if (!sdk) return;
    setState({ saving: true, error: null });
    const addedIds = uploads.readyIds;
    const removedIds = message.attachments
      .filter((attachment) => !keptAttachmentIds.has(attachment.id))
      .map((attachment) => attachment.id);
    try {
      const edited = await sdk.messages.edit(message.roomId, message.id, {
        body,
        mentions: toMentionInputs(mentions),
        ...(addedIds.length > 0 || removedIds.length > 0
          ? {
              attachments: {
                ...(addedIds.length > 0 ? { add: addedIds } : {}),
                ...(removedIds.length > 0 ? { remove: removedIds } : {}),
              },
            }
          : {}),
        ...(linkPreview.chosenUrl !== originalLinkPreviewUrl
          ? { linkPreviewUrl: linkPreview.chosenUrl }
          : {}),
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
      {message.attachments.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {message.attachments.map((attachment) => {
            const kept = keptAttachmentIds.has(attachment.id);
            return (
              <li
                key={attachment.id}
                className="flex items-center gap-1 rounded-md border bg-muted/50 py-1 pr-1 pl-2 text-xs"
              >
                <span
                  className={
                    kept ? 'max-w-32 truncate' : 'max-w-32 truncate line-through opacity-60'
                  }
                >
                  {attachment.filename}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5"
                  onClick={() => toggleKept(attachment.id)}
                  aria-label={t(
                    kept ? 'chat.edit.attachments.remove' : 'chat.edit.attachments.keep',
                    { filename: attachment.filename },
                  )}
                >
                  {kept ? <X className="size-3" /> : <RotateCcw className="size-3" />}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {canAttach ? (
        <ComposerAttachments
          entries={uploads.entries}
          onRemove={uploads.remove}
          onRetry={uploads.retry}
        />
      ) : null}
      {linkPreview.preview ? (
        <LinkPreviewCard
          preview={linkPreview.preview}
          imageRef={{ kind: 'preview', previewId: linkPreview.preview.id }}
          onNext={linkPreview.links.length > 1 ? linkPreview.next : undefined}
          nextLabel={t('chat.linkPreview.next')}
          onRemove={linkPreview.dismiss}
          removeLabel={t('chat.linkPreview.remove')}
        />
      ) : null}
      <MessageEditor
        roomId={message.roomId}
        allowCollective={allowCollective}
        disabled={state.saving}
        allowEmptyBody={hasAnyAttachment}
        initial={{ body: message.body, mentions: message.mentions }}
        label={t('chat.edit.label')}
        onBodyChange={setDraftBody}
        onSubmit={(edited) => void save(edited)}
        onUnchanged={() => {
          if (hasNonBodyChanges) void save({ body: message.body, mentions: message.mentions });
          else onFinished();
        }}
        onCancel={onFinished}
        onDirtyChange={onDirtyChange}
      >
        {({ canSubmit, submit }) => (
          <div className="flex flex-col gap-1">
            {canAttach ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    if (event.target.files) uploads.add([...event.target.files]);
                    event.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={state.saving || uploads.atLimit}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={t('chat.attachments.upload.attach')}
                >
                  <Paperclip className="size-4" />
                </Button>
              </>
            ) : null}
            <Button type="button" size="sm" disabled={!canSubmit || uploads.busy} onClick={submit}>
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
