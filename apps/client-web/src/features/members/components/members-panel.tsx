import { X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { MemberList } from '@/features/members/components/member-list';
import { useMembersPanelPrefs } from '@/features/members/hooks/use-members-panel-prefs';
import { groupMembers, type MembersView } from '@/features/members/lib/group-members';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { useRoomMembers } from '@/shared/members/room-members';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';

/** Tailwind's `lg` breakpoint: from there the panel is a column, below it a sheet. */
const INLINE_QUERY = '(min-width: 1024px)';

const VIEWS: readonly MembersView[] = ['role', 'alpha'];

function PanelBody({
  roomId,
  title,
  onClose,
}: {
  roomId: string;
  title: ReactNode;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { view, setView } = useMembersPanelPrefs();
  const [query, setQuery] = useState('');
  const members = useRoomMembers(roomId);
  const grouped = members.data ? groupMembers(members.data.members, { query, view }) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 text-sm font-semibold">
          {title}
          {grouped ? (
            <span className="ml-2 font-normal text-muted-foreground">{grouped.total}</span>
          ) : null}
        </div>
        {onClose ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('members.panel.close')}
            onClick={onClose}
          >
            <X />
          </Button>
        ) : null}
      </div>
      <fieldset className="flex gap-1 border-0 p-0">
        <legend className="sr-only">{t('members.panel.viewLabel')}</legend>
        {VIEWS.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={view === option ? 'secondary' : 'ghost'}
            aria-pressed={view === option}
            onClick={() => setView(option)}
          >
            {t(`members.panel.views.${option}`)}
          </Button>
        ))}
      </fieldset>
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('members.panel.search')}
        aria-label={t('members.panel.search')}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {members.isPending ? (
          <div className="space-y-2" role="status" aria-label={t('members.panel.loading')}>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : members.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">{t('members.panel.error')}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void members.refetch()}
            >
              {t('members.panel.retry')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {members.data.truncated ? (
              <p role="status" className="text-xs text-muted-foreground">
                {t('members.panel.truncated', { count: members.data.members.length })}
              </p>
            ) : null}
            {grouped && grouped.total === 0 ? (
              <p className="text-sm text-muted-foreground">{t('members.panel.empty')}</p>
            ) : grouped && grouped.matches === 0 ? (
              <p className="text-sm text-muted-foreground">{t('members.panel.noMatch')}</p>
            ) : grouped ? (
              <MemberList sections={grouped.sections} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The members of a room next to its content: an inline column from `lg`, a sheet
 * from the right below. Open state and view come from {@link useMembersPanelPrefs},
 * so the header toggle drives it.
 */
export function MembersPanel({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const { open, setOpen } = useMembersPanelPrefs();
  const inline = useMediaQuery(INLINE_QUERY);

  if (inline) {
    if (!open) return null;
    return (
      <aside
        aria-label={t('members.panel.title')}
        className="flex min-h-0 w-72 shrink-0 flex-col border-l p-4"
      >
        <PanelBody
          roomId={roomId}
          title={<h2 className="inline">{t('members.panel.title')}</h2>}
          onClose={() => setOpen(false)}
        />
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" aria-describedby={undefined} className="flex flex-col">
        <PanelBody roomId={roomId} title={<SheetTitle>{t('members.panel.title')}</SheetTitle>} />
      </SheetContent>
    </Sheet>
  );
}
