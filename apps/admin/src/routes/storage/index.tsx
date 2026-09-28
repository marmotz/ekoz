import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { HardDrive } from 'lucide-react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { AppShell } from '@/shared/layout/app-shell';
import { registerNav } from '@/shared/layout/nav-registry';
import { formatBytes } from '@/shared/lib/bytes';
import { RequireOwner } from '@/shared/sdk/require-owner';
import { useSdk } from '@/shared/sdk/session';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

registerNav({ id: 'storage', to: '/storage', labelKey: 'nav.storage', icon: HardDrive });

export const Route = createFileRoute('/storage/')({
  component: StorageDashboardRoute,
});

function StorageDashboardRoute() {
  const { t } = useTranslation(['storage', 'common']);
  const sdk = useSdk();

  const query = useQuery({
    queryKey: ['admin', 'storage', 'dashboard'],
    queryFn: () => sdk?.admin.storage(),
    enabled: !!sdk,
  });

  return (
    <RequireOwner>
      <AppShell title={t('storage:title')}>
        {query.isPending || !query.data ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="flex flex-col gap-6">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">{t('storage:dashboard.usage')}</dt>
                <dd className="text-lg font-semibold">{formatBytes(query.data.usedBytes)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('storage:dashboard.capacity')}</dt>
                <dd className="text-lg font-semibold">
                  {query.data.capacityBytes === null
                    ? t('storage:dashboard.unlimited')
                    : formatBytes(query.data.capacityBytes)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('storage:dashboard.blobCount')}</dt>
                <dd className="text-lg font-semibold">{query.data.blobCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('storage:dashboard.pendingUploads')}</dt>
                <dd className="text-lg font-semibold">{query.data.pendingUploads}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{t('storage:dashboard.driver')}</h2>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{query.data.driver}</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{t('storage:dashboard.mediaTools.title')}</h2>
              <div className="flex items-center gap-2">
                <Badge variant={query.data.mediaTools.available ? 'default' : 'destructive'}>
                  {query.data.mediaTools.available
                    ? t('storage:dashboard.mediaTools.available')
                    : t('storage:dashboard.mediaTools.unavailable')}
                </Badge>
                {query.data.mediaTools.available && query.data.mediaTools.ffmpegVersion && (
                  <span className="text-sm text-muted-foreground">
                    {t('storage:dashboard.mediaTools.version', {
                      version: query.data.mediaTools.ffmpegVersion,
                    })}
                  </span>
                )}
              </div>
              {!query.data.mediaTools.available && (
                <p className="text-sm text-muted-foreground">
                  {t('storage:dashboard.mediaTools.installHint')}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{t('storage:dashboard.topConsumers')}</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('storage:userCard.title')}</TableHead>
                    <TableHead>{t('storage:dashboard.usage')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.topConsumers.map((consumer) => (
                    <TableRow key={consumer.user.id}>
                      <TableCell>
                        <Link
                          to="/users/$userId"
                          params={{ userId: consumer.user.id }}
                          className="hover:underline"
                        >
                          {consumer.user.displayName ??
                            consumer.user.identifier ??
                            consumer.user.id}
                        </Link>
                      </TableCell>
                      <TableCell>{formatBytes(consumer.usedBytes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </AppShell>
    </RequireOwner>
  );
}
