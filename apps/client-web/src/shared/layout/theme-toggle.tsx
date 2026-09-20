import { Monitor, Moon, Sun } from 'lucide-react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export type ThemeChoice = 'light' | 'dark' | 'system';

const OPTIONS = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'system', Icon: Monitor },
] as const;

/**
 * Presentational: the theme state lives in `app/theme` (`useTheme`), which
 * `shared` may not import, so the caller passes it in.
 */
export function ThemeToggle({
  theme,
  onThemeChange,
}: {
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
}) {
  const { t } = useTranslation();
  const Current = OPTIONS.find((option) => option.value === theme)?.Icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('theme.label')}>
          <Current className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => onThemeChange(value)}>
            <Icon className="size-4" /> {t(`theme.${value}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
