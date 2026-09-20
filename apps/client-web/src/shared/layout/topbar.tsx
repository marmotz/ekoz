import { useMatches } from '@tanstack/react-router';
import type { ParseKeys } from 'i18next';
import type { ReactNode } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { LanguageSwitcher } from '@/shared/layout/language-switcher';
import { type ThemeChoice, ThemeToggle } from '@/shared/layout/theme-toggle';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Translation key of the page title shown in the top bar. */
    title?: ParseKeys;
  }
}

export interface TopbarProps {
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  /** Before the title, e.g. the button opening the navigation below `md`. */
  leading?: ReactNode;
  /** The `user-menu` slot, filled by the profile feature. */
  children?: ReactNode;
}

export function Topbar({ theme, onThemeChange, leading, children }: TopbarProps) {
  const { t } = useTranslation();
  const matches = useMatches();
  const titleKey = [...matches].reverse().find((match) => match.staticData?.title)
    ?.staticData?.title;

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-4">
      {leading}
      <h1 className="flex-1 truncate text-base font-semibold">{titleKey ? t(titleKey) : null}</h1>
      <LanguageSwitcher />
      <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
      {children}
    </header>
  );
}
