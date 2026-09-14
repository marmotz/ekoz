import { LogOut, Monitor, Moon, Sun, User } from 'lucide-react';

import { useTheme } from '@/app/theme';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useSdk } from '@/shared/sdk/session';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export function Topbar({ title }: { title: string }) {
  const { t, i18n } = useTranslation('common');
  const { theme, setTheme } = useTheme();
  const sdk = useSdk();
  const identifier = sdk?.session.getState()?.identifier ?? undefined;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <h1 className="text-sm font-semibold">{title}</h1>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('topbar.language.en')}>
              {i18n.language === 'fr' ? 'FR' : 'EN'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void i18n.changeLanguage('en')}>
              {t('topbar.language.en')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void i18n.changeLanguage('fr')}>
              {t('topbar.language.fr')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="theme">
              {theme === 'dark' ? (
                <Moon className="size-4" />
              ) : theme === 'light' ? (
                <Sun className="size-4" />
              ) : (
                <Monitor className="size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setTheme('light')}>
              <Sun className="size-4" /> {t('topbar.theme.light')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme('dark')}>
              <Moon className="size-4" /> {t('topbar.theme.dark')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme('system')}>
              <Monitor className="size-4" /> {t('topbar.theme.system')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="user menu">
              <Avatar>
                <AvatarFallback>
                  <User className="size-4" />
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {identifier && <DropdownMenuLabel>{identifier}</DropdownMenuLabel>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void sdk?.auth.logout()}>
              <LogOut className="size-4" /> {t('topbar.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
