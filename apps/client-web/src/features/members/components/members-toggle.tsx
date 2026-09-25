import { Users } from 'lucide-react';

import { useMembersPanelPrefs } from '@/features/members/hooks/use-members-panel-prefs';
import { groupMembers } from '@/features/members/lib/group-members';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useRoomMembers } from '@/shared/members/room-members';
import { Button } from '@/shared/ui/button';

/** Room header button that opens and closes the members panel, with the member count. */
export function MembersToggle({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const { open, view, toggle } = useMembersPanelPrefs();
  const members = useRoomMembers(roomId);
  const total = members.data ? groupMembers(members.data.members, { view }).total : null;

  return (
    <Button type="button" size="sm" variant="outline" aria-expanded={open} onClick={toggle}>
      <Users />
      {t('members.toggle.label')}
      {total !== null ? (
        <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{total}</span>
      ) : null}
    </Button>
  );
}
