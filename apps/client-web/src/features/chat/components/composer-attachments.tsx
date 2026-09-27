import type { ParseKeys } from 'i18next';
import { AlertCircle, File as FileIcon, X } from 'lucide-react';

import type { UploadEntry } from '@/features/chat/hooks/use-composer-uploads';
import { useTranslation } from '@/shared/i18n/use-translation';
import { formatBytes } from '@/shared/lib/format-bytes';
import { Button } from '@/shared/ui/button';

const ERROR_KEYS: Record<string, ParseKeys> = {
  'upload.quota_exceeded': 'chat.attachments.upload.errors.quotaExceeded',
  'upload.too_large': 'chat.attachments.upload.errors.tooLarge',
  'upload.type_rejected': 'chat.attachments.upload.errors.typeRejected',
  'upload.capacity_exceeded': 'chat.attachments.upload.errors.capacityExceeded',
  'upload.expired': 'chat.attachments.upload.errors.expired',
  network: 'chat.attachments.upload.errors.network',
  unknown: 'chat.attachments.upload.errors.generic',
};

export interface ComposerAttachmentsProps {
  entries: readonly UploadEntry[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}

/** One chip per file above the composer: preview or icon, name, progress or size, cancel/retry. */
export function ComposerAttachments({ entries, onRemove, onRetry }: ComposerAttachmentsProps) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  return (
    <ul className="mb-2 flex flex-wrap gap-2" aria-label={t('chat.attachments.upload.tray')}>
      {entries.map((entry) => (
        <li
          key={entry.localId}
          className="flex items-center gap-2 rounded-md border bg-muted/50 py-1 pr-2 pl-1 text-xs"
        >
          {entry.previewUrl ? (
            <img src={entry.previewUrl} alt="" className="size-8 rounded object-cover" />
          ) : (
            <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <div className="flex min-w-0 flex-col">
            <span className="max-w-40 truncate">{entry.file.name}</span>
            {entry.state === 'failed' ? (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
                {t(
                  ERROR_KEYS[entry.error ?? 'unknown'] ?? 'chat.attachments.upload.errors.generic',
                )}
              </span>
            ) : entry.state === 'uploading' ? (
              <span className="text-muted-foreground">
                {t('chat.attachments.upload.progress', { percent: entry.progress })}
              </span>
            ) : (
              <span className="text-muted-foreground">{formatBytes(entry.file.size)}</span>
            )}
          </div>
          {entry.state === 'failed' ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onRetry(entry.localId)}>
              {t('chat.attachments.upload.retry')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5"
            onClick={() => onRemove(entry.localId)}
            aria-label={t('chat.attachments.upload.remove', { filename: entry.file.name })}
          >
            <X className="size-3" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
