import { Menu } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { Sidebar, SidebarNav, SidebarSections } from '@/shared/layout/sidebar';
import type { ThemeChoice } from '@/shared/layout/theme-toggle';
import { Topbar } from '@/shared/layout/topbar';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';

export interface AppShellProps {
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  /** Rendered in the top bar `user-menu` slot. */
  userMenu?: ReactNode;
  children: ReactNode;
}

/** Sidebar + sticky top bar + scrollable content. Below `md` the sidebar becomes a `Sheet`. */
export function AppShell({ theme, onThemeChange, userMenu, children }: AppShellProps) {
  const { t } = useTranslation();
  const [navOpen, setNavOpen] = useState(false);

  const menuButton = (
    <Sheet open={navOpen} onOpenChange={setNavOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('nav.open')}>
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetTitle>{t('appName')}</SheetTitle>
        <SheetDescription className="sr-only">{t('nav.label')}</SheetDescription>
        <div className="mt-4 flex flex-col gap-4">
          <SidebarNav onNavigate={() => setNavOpen(false)} />
          <SidebarSections onNavigate={() => setNavOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar theme={theme} onThemeChange={onThemeChange} leading={menuButton}>
          {userMenu}
        </Topbar>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
