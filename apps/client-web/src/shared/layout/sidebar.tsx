import { Link } from '@tanstack/react-router';

import { useTranslation } from '@/shared/i18n/use-translation';
import { getNavEntries } from '@/shared/layout/nav-registry';
import { getSidebarSections } from '@/shared/layout/sidebar-section-registry';
import { cn } from '@/shared/lib/utils';

/** The registered navigation entries. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('nav.label')} className="flex flex-col gap-1">
      {getNavEntries().map(({ id, to, labelKey, icon: Icon }) => (
        <Link
          key={id}
          to={to}
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
          activeProps={{ className: 'bg-accent text-accent-foreground' }}
        >
          {Icon && <Icon className="size-4" />}
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}

/** The sections features registered, in order, below the navigation. */
export function SidebarSections({ onNavigate }: { onNavigate?: () => void }) {
  return getSidebarSections().map(({ id, component: Section }) => (
    <Section key={id} onNavigate={onNavigate} />
  ));
}

/** Fixed-width column shown from the `md` breakpoint up; below it the shell uses a `Sheet`. */
export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="surface-panel hidden w-60 shrink-0 flex-col gap-4 border-r p-4 md:flex">
      <span className="px-3 text-lg font-semibold">{t('appName')}</span>
      <SidebarNav />
      <SidebarSections />
    </aside>
  );
}
