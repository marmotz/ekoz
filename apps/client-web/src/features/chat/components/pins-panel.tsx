import type { MessagePin } from '@ekozhq/sdk';

import { useAuthorLabel } from '@/features/chat/hooks/use-author-label';
import { useAuthors } from '@/features/chat/hooks/use-authors';
import { usePins } from '@/features/chat/hooks/use-pins';
import { visiblePins } from '@/features/chat/lib/pins';
import { useTranslation } from '@/shared/i18n/use-translation';
import { MessageBody } from '@/shared/messages/message-body';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';

export interface PinsPanelProps {
  roomId: string;
  enabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** An entry was chosen: the panel closes and the caller jumps to the message. */
  onSelect: (pin: MessagePin) => void;
}

function Entries({
  roomId,
  pins,
  onSelect,
}: {
  roomId: string;
  pins: MessagePin[];
  onSelect: (pin: MessagePin) => void;
}) {
  const { t, i18n } = useTranslation();
  const label = useAuthorLabel();
  const { resolve } = useAuthors(
    roomId,
    pins.flatMap((pin) => [pin.message.authorId, pin.pinnedById]),
  );
  const name = (userId: string | null) => {
    const author = resolve(userId);
    return author.kind === 'pending' ? '…' : label(author);
  };

  return (
    <ol className="space-y-2 overflow-y-auto" aria-label={t('chat.pins.list')}>
      {pins.map((pin) => (
        <li key={pin.messageId}>
          <button
            type="button"
            className="w-full rounded-md border p-3 text-left hover:bg-accent"
            onClick={() => onSelect(pin)}
          >
            <span className="flex items-baseline gap-2">
              <span className="text-sm font-medium">{name(pin.message.authorId)}</span>
              <time
                dateTime={new Date(pin.message.createdAt).toISOString()}
                className="text-xs text-muted-foreground"
              >
                {new Date(pin.message.createdAt).toLocaleString(i18n.language, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </time>
            </span>
            <span className="block">
              <MessageBody
                body={pin.message.body}
                roomId={roomId}
                mentions={pin.message.mentions}
                compact
              />
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t('chat.pins.pinnedBy', { name: name(pin.pinnedById) })}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** The pinned messages of a room, newest first, in a sheet from the right. */
export function PinsPanel({
  roomId,
  enabled = true,
  open,
  onOpenChange,
  onSelect,
}: PinsPanelProps) {
  const { t } = useTranslation();
  const pins = usePins(roomId, enabled);
  const visible = visiblePins(pins.data);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('chat.pins.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('chat.pins.description')}</SheetDescription>
        </SheetHeader>
        {pins.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('chat.pins.loading')}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('chat.pins.empty')}</p>
        ) : (
          <Entries
            roomId={roomId}
            pins={visible}
            onSelect={(pin) => {
              onOpenChange(false);
              onSelect(pin);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
