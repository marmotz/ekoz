import type { FileRef, LinkPreviewView } from '@ekozhq/sdk';
import { ChevronRight, X } from 'lucide-react';

import { useFileUrl } from '@/shared/sdk/use-file-url';
import { Button } from '@/shared/ui/button';

export interface LinkPreviewCardProps {
  preview: LinkPreviewView;
  /** `preview` or `message_preview` ref of its image, or `null` when it has none. */
  imageRef: FileRef | null;
  /** Cycles to the next link found in the same body; the composer only. */
  onNext?: () => void;
  nextLabel?: string;
  onRemove?: () => void;
  removeLabel?: string;
}

/**
 * Title, description, site and image of a link preview, in the composer (with a
 * "next link" cycling button) or under a sent message (with a remove button for
 * its author) (technical.md §6).
 */
export function LinkPreviewCard({
  preview,
  imageRef,
  onNext,
  nextLabel,
  onRemove,
  removeLabel,
}: LinkPreviewCardProps) {
  const imageUrl = useFileUrl(preview.hasImage ? imageRef : null);

  return (
    <div className="mt-1 flex max-w-sm gap-2 rounded-md border p-2">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={preview.title ?? preview.siteName ?? ''}
          className="size-16 shrink-0 rounded object-cover"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        {preview.siteName ? (
          <p className="truncate text-xs text-muted-foreground">{preview.siteName}</p>
        ) : null}
        {preview.title ? <p className="truncate text-sm font-medium">{preview.title}</p> : null}
        {preview.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{preview.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {onNext ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onNext}
            aria-label={nextLabel}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        ) : null}
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onRemove}
            aria-label={removeLabel}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
