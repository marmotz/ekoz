import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { useSdk, useSession } from '@/shared/sdk/session';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Gates every screen except `/setup` and `/login` behind an authenticated
 * owner (technical.md §6). No non-owner admin role exists in this increment.
 */
export function RequireOwner({ children }: { children: ReactNode }) {
  const status = useSession();
  const sdk = useSdk();
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  useEffect(() => {
    if (status === 'anonymous') void navigate({ to: '/login' });
  }, [status, navigate]);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => sdk?.me.get(),
    enabled: status === 'authenticated' && !!sdk,
  });

  if (status === 'unknown' || (status === 'authenticated' && meQuery.isPending)) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (status === 'anonymous') return null;

  if (meQuery.data && !meQuery.data.isOwner) {
    return (
      <div className="flex flex-col items-center gap-4 p-12 text-center">
        <h1 className="text-lg font-semibold">{t('notOwner.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('notOwner.description')}</p>
        <Button variant="outline" onClick={() => void sdk?.auth.logout()}>
          {t('notOwner.signOut')}
        </Button>
      </div>
    );
  }

  return children;
}
