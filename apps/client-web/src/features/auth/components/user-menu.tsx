import { Link } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { getUserMenuItems } from '@/shared/layout/user-menu-items';
import { useSession } from '@/shared/sdk/session';
import { useMe } from '@/shared/sdk/use-me';
import { useSdk } from '@/shared/sdk/use-sdk';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Skeleton } from '@/shared/ui/skeleton';
import { UserAvatar } from '@/shared/ui/user-avatar';

function SignedInMenu() {
  const { t } = useTranslation();
  const sdk = useSdk();
  const me = useMe();

  if (me.isPending) {
    return <Skeleton className="size-8 rounded-full" data-testid="user-menu-skeleton" />;
  }

  const displayName = me.data?.displayName;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label={t('auth.userMenu.label')}>
          <UserAvatar
            identifier={me.data?.identifier}
            avatarUrl={me.data?.avatarUrl}
            displayName={displayName}
          />
          {displayName ? (
            <span className="hidden max-w-40 truncate sm:inline">{displayName}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {displayName ? (
          <>
            <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {getUserMenuItems().map(({ id, to, labelKey, icon: Icon }) => (
          <DropdownMenuItem key={id} asChild>
            <Link to={to}>
              {Icon ? <Icon className="size-4" /> : null} {t(labelKey)}
            </Link>
          </DropdownMenuItem>
        ))}
        {/* No navigation here: `logout()` emits `session:invalid`, which `SessionGuard` turns into a redirect to `/login`. */}
        <DropdownMenuItem onSelect={() => void sdk?.auth.logout()}>
          <LogOut className="size-4" /> {t('auth.userMenu.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Fills the top bar `user-menu` slot: the signed-in user's name and a "Sign out"
 * entry. Renders nothing for an anonymous session, and only fetches `GET /me`
 * once the session is authenticated.
 */
export function UserMenu() {
  const { status } = useSession();

  if (status === 'anonymous') return null;
  if (status === 'unknown') return <Skeleton className="size-8 rounded-full" />;
  return <SignedInMenu />;
}
