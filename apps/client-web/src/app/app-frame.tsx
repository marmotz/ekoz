import type { ReactNode } from 'react';

import { useTheme } from '@/app/use-theme';
import { AppShell } from '@/shared/layout/app-shell';

/** Binds the app-level theme state to the (presentational) shell. */
export function AppFrame({ userMenu, children }: { userMenu?: ReactNode; children: ReactNode }) {
  const { theme, setTheme } = useTheme();

  return (
    <AppShell theme={theme} onThemeChange={setTheme} userMenu={userMenu}>
      {children}
    </AppShell>
  );
}
