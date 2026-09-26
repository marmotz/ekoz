import { Pin } from 'lucide-react';

import { usePins } from '@/features/chat/hooks/use-pins';
import { visiblePins } from '@/features/chat/lib/pins';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';

export interface PinsToggleProps {
  roomId: string;
  /** Whether the caller can read the room (`room.read`); the pins are not fetched otherwise. */
  enabled?: boolean;
  open: boolean;
  onToggle: () => void;
}

/** Room header button that opens the pinned messages panel, with the pin count. */
export function PinsToggle({ roomId, enabled = true, open, onToggle }: PinsToggleProps) {
  const { t } = useTranslation();
  const pins = usePins(roomId, enabled);
  const total = pins.data ? visiblePins(pins.data).length : null;

  return (
    <Button type="button" size="sm" variant="outline" aria-expanded={open} onClick={onToggle}>
      <Pin />
      {t('chat.pins.toggle')}
      {total !== null ? (
        <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{total}</span>
      ) : null}
    </Button>
  );
}
