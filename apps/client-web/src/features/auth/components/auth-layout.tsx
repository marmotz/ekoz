import type { ReactNode } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { LanguageSwitcher } from '@/shared/layout/language-switcher';
import { type ThemeChoice, ThemeToggle } from '@/shared/layout/theme-toggle';
import { Card } from '@/shared/ui/card';

export interface AuthLayoutProps {
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  children: ReactNode;
}

/**
 * Frame of the anonymous pages: a centered card with the language switcher and the
 * theme toggle, and no sidebar. Presentational, like `AppShell`: the theme state
 * lives in `app`, which a feature may not import, so the route passes it in.
 */
export function AuthLayout({ theme, onThemeChange, children }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="text-base font-semibold">{t('appName')}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">{children}</Card>
      </main>
    </div>
  );
}
