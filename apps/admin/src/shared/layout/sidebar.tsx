import { Link } from '@tanstack/react-router';

import { useTranslation } from '@/shared/i18n/use-translation';
import { getNavEntries } from '@/shared/layout/nav-registry';
import { cn } from '@/shared/lib/utils';

export function Sidebar() {
  const { t } = useTranslation('common');
  const entries = getNavEntries();

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r p-3">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <Link
            key={entry.id}
            to={entry.to}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
            )}
            activeProps={{ className: 'bg-accent text-accent-foreground' }}
          >
            <Icon className="size-4" />
            {t(entry.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
