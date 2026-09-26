import type { PresenceStatus } from '@ekozhq/sdk';

import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';

const LABEL_KEYS = {
  online: 'presence.status.online',
  away: 'presence.status.away',
  offline: 'presence.status.offline',
} as const satisfies Record<PresenceStatus, string>;

const DOT_CLASS: Record<PresenceStatus, string> = {
  online: 'bg-green-500 border-background',
  away: 'bg-amber-500 border-background',
  offline: 'bg-background border-muted-foreground',
};

/** A presence dot (green online, amber away, hollow grey offline) with an accessible label. */
export function PresenceDot({ status, className }: { status: PresenceStatus; className?: string }) {
  const { t } = useTranslation();

  return (
    <span
      role="img"
      aria-label={t(LABEL_KEYS[status])}
      data-presence={status}
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full border-2',
        DOT_CLASS[status],
        className,
      )}
    />
  );
}
