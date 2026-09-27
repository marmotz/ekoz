import { Paperclip } from 'lucide-react';
import { type ChangeEvent, type ClipboardEvent, type DragEvent, useRef, useState } from 'react';

import { ComposerAttachments } from '@/features/chat/components/composer-attachments';
import { LinkPreviewCard } from '@/features/chat/components/link-preview-card';
import { type ComposerMessage, MessageEditor } from '@/features/chat/components/message-editor';
import { useComposerUploads } from '@/features/chat/hooks/use-composer-uploads';
import { useLinkPreview } from '@/features/chat/hooks/use-link-preview';
import type { ComposerBlock } from '@/features/chat/lib/composer-state';
import type { PendingAttachment } from '@/features/chat/lib/timeline';
import { useAuthPolicy } from '@/shared/auth/use-auth-policy';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';

export type { ComposerMessage };

export interface ComposerSendMessage extends ComposerMessage {
  attachments: PendingAttachment[];
  linkPreviewUrl?: string;
}

const BLOCK_KEYS = {
  join: 'chat.composer.disabled.join',
  read_only: 'chat.composer.disabled.readOnly',
  permission: 'chat.composer.disabled.permission',
} as const satisfies Record<ComposerBlock, string>;

export interface ComposerProps {
  roomId: string;
  /** Whether `@all`, roles and groups can be mentioned (channels only). */
  allowCollective: boolean;
  /** Why writing is not possible, or `null`. */
  block: ComposerBlock | null;
  /** True until the history is loaded: there is nowhere to add a pending message yet. */
  loading?: boolean;
  /** Whether files can be attached (`room.attach`); the attach control is hidden otherwise. */
  canAttach?: boolean;
  onSend: (message: ComposerSendMessage) => void;
  /** Called when the user changes the draft while it has content. */
  onTyping?: () => void;
}

/**
 * The composer of a room: the message editor (toolbar, Enter rules, length counter),
 * an attachment tray fed by a file picker, drag-and-drop and paste, and its send
 * button, or why writing is not possible.
 */
export function Composer({
  roomId,
  allowCollective,
  block,
  loading = false,
  canAttach = false,
  onSend,
  onTyping,
}: ComposerProps) {
  const { t } = useTranslation();
  const uploads = useComposerUploads();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const disabled = block !== null || loading;
  const [draftBody, setDraftBody] = useState('');
  const authPolicy = useAuthPolicy();
  const linkPreview = useLinkPreview(draftBody, authPolicy.data?.linkPreviews ?? false);

  const addFiles = (files: Iterable<File>) => {
    if (!canAttach || disabled) return;
    uploads.add([...files]);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop/paste target, not an interactive control; the editor inside stays the tab stop.
    <div
      className="border-t p-3"
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        if (!canAttach) return;
        event.preventDefault();
        addFiles(event.dataTransfer.files);
      }}
      onDragOver={(event: DragEvent<HTMLDivElement>) => {
        if (canAttach) event.preventDefault();
      }}
      onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) addFiles(files);
      }}
    >
      {block ? <p className="mb-2 text-sm text-muted-foreground">{t(BLOCK_KEYS[block])}</p> : null}
      <ComposerAttachments
        entries={uploads.entries}
        onRemove={uploads.remove}
        onRetry={uploads.retry}
      />
      {linkPreview.preview ? (
        <LinkPreviewCard
          preview={linkPreview.preview}
          imageRef={{ kind: 'preview', previewId: linkPreview.preview.id }}
          onNext={linkPreview.links.length > 1 ? linkPreview.next : undefined}
          nextLabel={t('chat.linkPreview.next')}
          onRemove={linkPreview.dismiss}
          removeLabel={t('chat.linkPreview.dismiss')}
        />
      ) : null}
      <MessageEditor
        roomId={roomId}
        allowCollective={allowCollective}
        disabled={disabled}
        allowEmptyBody={uploads.readyIds.length > 0}
        onBodyChange={setDraftBody}
        onSubmit={(message) => {
          const attachments = uploads.takeReady().map((entry) => ({
            uploadId: entry.uploadId as string,
            filename: entry.file.name,
            contentType: entry.file.type,
            previewUrl: entry.previewUrl,
          }));
          onSend({
            ...message,
            attachments,
            ...(linkPreview.chosenUrl ? { linkPreviewUrl: linkPreview.chosenUrl } : {}),
          });
          linkPreview.reset();
        }}
        onTyping={onTyping}
      >
        {({ canSubmit, submit }) => (
          <div className="flex items-end gap-1">
            {canAttach ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || uploads.atLimit}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={t('chat.attachments.upload.attach')}
                >
                  <Paperclip className="size-4" />
                </Button>
              </>
            ) : null}
            <Button type="button" disabled={!canSubmit || uploads.busy} onClick={submit}>
              {t('chat.composer.send')}
            </Button>
          </div>
        )}
      </MessageEditor>
    </div>
  );
}
