import { Circle } from 'lucide-react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { useManualAway } from '@/shared/realtime/own-presence';
import { useSdk } from '@/shared/sdk/use-sdk';
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu';

/** User menu entry that toggles "appear away" (web-client-presence-and-typing C4). */
export function PresenceMenuItem() {
  const { t } = useTranslation();
  const reporter = useSdk()?.presence.reporter;
  const manualAway = useManualAway();

  if (!reporter) return null;

  return (
    <DropdownMenuItem onSelect={() => void reporter.setManualAway(!manualAway).catch(() => {})}>
      <Circle className="size-4" />{' '}
      {t(manualAway ? 'presence.menu.appearOnline' : 'presence.menu.appearAway')}
    </DropdownMenuItem>
  );
}
