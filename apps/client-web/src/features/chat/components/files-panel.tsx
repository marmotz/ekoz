import type { RoomFileItem } from '@ekozhq/sdk';
import { File as FileIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useRoomFiles } from '@/features/chat/hooks/use-room-files';
import { useTranslation } from '@/shared/i18n/use-translation';
import { formatBytes } from '@/shared/lib/format-bytes';
import { useFileUrl } from '@/shared/sdk/use-file-url';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

export interface FilesPanelProps {
  roomId: string;
  /** Whether the caller can read the room (`room.read`); files are not fetched otherwise. */
  enabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A file was chosen: the panel closes and the caller jumps to its message. */
  onSelect: (file: RoomFileItem) => void;
}

function MediaTile({ file, onSelect }: { file: RoomFileItem; onSelect: () => void }) {
  const thumbUrl = useFileUrl(
    file.hasThumbnail
      ? { kind: 'attachment', id: file.id, variant: 'thumbnail' }
      : { kind: 'attachment', id: file.id, variant: 'original' },
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative block aspect-square w-full overflow-hidden rounded-md bg-muted"
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={file.filename}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </button>
  );
}

function DocumentRow({ file, onSelect }: { file: RoomFileItem; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-md border p-2 text-left hover:bg-accent"
    >
      <FileIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{file.filename}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</p>
      </div>
    </button>
  );
}

function FilesTab({
  roomId,
  kind,
  enabled,
  onSelect,
}: {
  roomId: string;
  kind: 'media' | 'documents';
  enabled: boolean;
  onSelect: (file: RoomFileItem) => void;
}) {
  const { t } = useTranslation();
  const query = useRoomFiles(roomId, kind, enabled);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">{t('rooms.files.loading')}</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(kind === 'media' ? 'rooms.files.emptyMedia' : 'rooms.files.emptyDocuments')}
      </p>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto">
      {kind === 'media' ? (
        <ul className="grid grid-cols-3 gap-1" aria-label={t('rooms.files.mediaTab')}>
          {items.map((file) => (
            <li key={file.id}>
              <MediaTile file={file} onSelect={() => onSelect(file)} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1" aria-label={t('rooms.files.documentsTab')}>
          {items.map((file) => (
            <li key={file.id}>
              <DocumentRow file={file} onSelect={() => onSelect(file)} />
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('rooms.files.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

/** A room's shared files, in a side panel with a Media grid and a Documents list. */
export function FilesPanel({
  roomId,
  enabled = true,
  open,
  onOpenChange,
  onSelect,
}: FilesPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'media' | 'documents'>('media');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('rooms.files.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('rooms.files.description')}</SheetDescription>
        </SheetHeader>
        <Tabs value={tab} onValueChange={(value) => setTab(value as 'media' | 'documents')}>
          <TabsList>
            <TabsTrigger value="media">{t('rooms.files.mediaTab')}</TabsTrigger>
            <TabsTrigger value="documents">{t('rooms.files.documentsTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="media">
            <FilesTab
              roomId={roomId}
              kind="media"
              enabled={enabled && open && tab === 'media'}
              onSelect={(file) => {
                onOpenChange(false);
                onSelect(file);
              }}
            />
          </TabsContent>
          <TabsContent value="documents">
            <FilesTab
              roomId={roomId}
              kind="documents"
              enabled={enabled && open && tab === 'documents'}
              onSelect={(file) => {
                onOpenChange(false);
                onSelect(file);
              }}
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
