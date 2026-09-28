import type { AttachmentView } from '@ekozhq/sdk';
import { EkozError, NetworkError } from '@ekozhq/sdk';
import type { ParseKeys } from 'i18next';
import { Download, File, Music, Play, X } from 'lucide-react';
import { useState } from 'react';

import { useMessageActionsContext } from '@/features/chat/hooks/message-actions-context';
import { useTranslation } from '@/shared/i18n/use-translation';
import { formatBytes } from '@/shared/lib/format-bytes';
import { useFileUrl } from '@/shared/sdk/use-file-url';
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

type Family = 'image' | 'video' | 'audio' | 'file';

function familyOf(contentType: string): Family {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'file';
}

const ERROR_KEYS: Record<string, ParseKeys> = {
  'room.permission_denied': 'chat.attachments.remove.errors.permissionDenied',
  'message.attachment_not_found': 'chat.attachments.remove.errors.notFound',
};

function errorKey(error: unknown): ParseKeys {
  if (error instanceof NetworkError) return 'chat.attachments.remove.errors.network';
  if (error instanceof EkozError) {
    return ERROR_KEYS[error.code] ?? 'chat.attachments.remove.errors.generic';
  }
  return 'chat.attachments.remove.errors.generic';
}

/** Confirms and runs the removal of one attachment (technical.md §6). */
function RemoveAttachmentDialog({
  roomId,
  messageId,
  attachment,
  onClose,
}: {
  roomId: string;
  messageId: string;
  attachment: AttachmentView | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sdk = useSdk();
  const [state, setState] = useState<{ status: 'idle' | 'removing' | 'error'; error?: ParseKeys }>({
    status: 'idle',
  });

  const close = () => {
    setState({ status: 'idle' });
    onClose();
  };

  const confirm = async () => {
    if (!sdk || !attachment) return;
    setState({ status: 'removing' });
    try {
      await sdk.messages.removeAttachment(roomId, messageId, attachment.id);
    } catch (error) {
      setState({ status: 'error', error: errorKey(error) });
      return;
    }
    close();
  };

  return (
    <Dialog open={attachment !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chat.attachments.remove.title')}</DialogTitle>
          <DialogDescription>
            {t('chat.attachments.remove.description', { filename: attachment?.filename ?? '' })}
          </DialogDescription>
        </DialogHeader>
        {state.status === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            {t(state.error ?? 'chat.attachments.remove.errors.generic')}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t('chat.attachments.remove.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={state.status === 'removing'}
            onClick={() => void confirm()}
          >
            {t('chat.attachments.remove.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A thumbnail or poster image sized from the attachment's own dimensions to avoid layout shift. */
function MediaTile({ attachment, onOpen }: { attachment: AttachmentView; onOpen: () => void }) {
  const { t } = useTranslation();
  const isVideo = familyOf(attachment.contentType) === 'video';
  const thumbUrl = useFileUrl(
    attachment.hasThumbnail
      ? { kind: 'attachment', id: attachment.id, variant: 'thumbnail' }
      : isVideo
        ? null
        : { kind: 'attachment', id: attachment.id, variant: 'original' },
  );
  const aspectRatio =
    attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : '4 / 3';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block w-full overflow-hidden rounded-md bg-muted"
      style={{ aspectRatio }}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={attachment.filename}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {isVideo ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play
            className="size-8 fill-white text-white"
            aria-label={t('chat.attachments.playVideo', { filename: attachment.filename })}
          />
        </span>
      ) : null}
    </button>
  );
}

/** Full-size media in a dialog, opened from a `MediaTile`. */
function Lightbox({
  attachment,
  onClose,
}: {
  attachment: AttachmentView | null;
  onClose: () => void;
}) {
  const originalUrl = useFileUrl(
    attachment ? { kind: 'attachment', id: attachment.id, variant: 'original' } : null,
  );
  const isVideo = attachment ? familyOf(attachment.contentType) === 'video' : false;

  return (
    <Dialog open={attachment !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none sm:max-w-3xl">
        <DialogTitle className="sr-only">{attachment?.filename}</DialogTitle>
        {originalUrl && attachment ? (
          isVideo ? (
            // biome-ignore lint/a11y/useMediaCaption: user-uploaded content, no caption track exists
            <video src={originalUrl} controls autoPlay className="max-h-[80vh] w-full rounded-md" />
          ) : (
            <img
              src={originalUrl}
              alt={attachment.filename}
              className="max-h-[80vh] w-full rounded-md object-contain"
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** `<audio controls>` on the attachment's signed URL. */
function AudioRow({ attachment }: { attachment: AttachmentView }) {
  const url = useFileUrl({ kind: 'attachment', id: attachment.id, variant: 'original' });
  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <Music className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{attachment.filename}</p>
        {url ? (
          // biome-ignore lint/a11y/useMediaCaption: user-uploaded content, no caption track exists
          <audio src={url} controls className="w-full" />
        ) : null}
      </div>
    </div>
  );
}

/** Icon, name, size and a download link for anything that is not media. */
function FileCard({ attachment }: { attachment: AttachmentView }) {
  const { t } = useTranslation();
  const url = useFileUrl({ kind: 'attachment', id: attachment.id, variant: 'original' });
  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <File className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{attachment.filename}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(attachment.sizeBytes)}</p>
      </div>
      {url ? (
        <Button variant="ghost" size="icon" asChild>
          <a
            href={url}
            download={attachment.filename}
            aria-label={t('chat.attachments.download', { filename: attachment.filename })}
          >
            <Download className="size-4" />
          </a>
        </Button>
      ) : (
        <Button variant="ghost" size="icon" disabled aria-hidden="true">
          <Download className="size-4" />
        </Button>
      )}
    </div>
  );
}

export interface MessageAttachmentsProps {
  roomId: string;
  messageId: string;
  authorId: string | null;
  attachments: readonly AttachmentView[];
}

/**
 * Renders a message's attachments: image/video grid with a lightbox, `<audio
 * controls>` rows, and a file card for everything else (technical.md §6).
 */
export function MessageAttachments({
  roomId,
  messageId,
  authorId,
  attachments,
}: MessageAttachmentsProps) {
  const { t } = useTranslation();
  const actions = useMessageActionsContext();
  const [opened, setOpened] = useState<AttachmentView | null>(null);
  const [removing, setRemoving] = useState<AttachmentView | null>(null);

  if (attachments.length === 0) return null;

  const media = attachments.filter((a) => {
    const family = familyOf(a.contentType);
    return family === 'image' || family === 'video';
  });
  const audio = attachments.filter((a) => familyOf(a.contentType) === 'audio');
  const files = attachments.filter((a) => familyOf(a.contentType) === 'file');

  const canRemove =
    actions !== null &&
    ((authorId !== null &&
      authorId === actions.myId &&
      actions.capabilities.includes('room.delete_own')) ||
      actions.capabilities.includes('room.delete_any'));

  return (
    <div className="mt-1 flex flex-col gap-2">
      {media.length > 0 ? (
        <div className="grid max-w-sm grid-cols-2 gap-1 sm:grid-cols-3">
          {media.map((attachment) => (
            <div key={attachment.id} className="group relative">
              <MediaTile attachment={attachment} onOpen={() => setOpened(attachment)} />
              {canRemove ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-1 top-1 size-6 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  onClick={() => setRemoving(attachment)}
                  aria-label={t('chat.attachments.remove.action')}
                >
                  <X className="size-3.5" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {audio.map((attachment) => (
        <div key={attachment.id} className="group relative">
          <AudioRow attachment={attachment} />
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => setRemoving(attachment)}
            >
              {t('chat.attachments.remove.action')}
            </Button>
          ) : null}
        </div>
      ))}
      {files.map((attachment) => (
        <div key={attachment.id} className="group relative">
          <FileCard attachment={attachment} />
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => setRemoving(attachment)}
            >
              {t('chat.attachments.remove.action')}
            </Button>
          ) : null}
        </div>
      ))}
      <Lightbox attachment={opened} onClose={() => setOpened(null)} />
      <RemoveAttachmentDialog
        roomId={roomId}
        messageId={messageId}
        attachment={removing}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
