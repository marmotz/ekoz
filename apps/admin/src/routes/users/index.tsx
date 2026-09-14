import type { AdminUserListItem } from '@ekozhq/sdk';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { AppShell } from '@/shared/layout/app-shell';
import { registerNav } from '@/shared/layout/nav-registry';
import { RequireOwner } from '@/shared/sdk/require-owner';
import { useSdk } from '@/shared/sdk/session';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

registerNav({ id: 'users', to: '/users', labelKey: 'nav.users', icon: Users });

export const Route = createFileRoute('/users/')({
  component: UsersListRoute,
});

type StatusFilter = 'all' | 'active' | 'suspended' | 'deleted';

function statusLabel(status: unknown): 'active' | 'suspended' | 'deleted' {
  return status as 'active' | 'suspended' | 'deleted';
}

function UsersListRoute() {
  const { t } = useTranslation(['users', 'common']);
  const sdk = useSdk();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<AdminUserListItem[]>([]);

  const query = useQuery({
    queryKey: ['admin', 'users', { q, status, ownerOnly, cursor }],
    queryFn: async () => {
      const result = await sdk?.admin.users.list({
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        owner: ownerOnly || undefined,
        cursor,
      });
      if (result) {
        setItems((previous) => (cursor ? [...previous, ...result.items] : result.items));
      }
      return result;
    },
    enabled: !!sdk,
  });

  return (
    <RequireOwner>
      <AppShell title={t('users:title')}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 items-center gap-2">
              <Input
                placeholder={t('users:search')}
                value={q}
                onChange={(event) => {
                  setCursor(undefined);
                  setQ(event.target.value);
                }}
                className="max-w-sm"
              />
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={status}
                onChange={(event) => {
                  setCursor(undefined);
                  setStatus(event.target.value as StatusFilter);
                }}
              >
                <option value="all">{t('users:filters.allStatuses')}</option>
                <option value="active">{t('common:status.active')}</option>
                <option value="suspended">{t('common:status.suspended')}</option>
                <option value="deleted">{t('common:status.deleted')}</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ownerOnly}
                  onChange={(event) => {
                    setCursor(undefined);
                    setOwnerOnly(event.target.checked);
                  }}
                />
                {t('users:filters.ownersOnly')}
              </label>
            </div>
            <Button asChild>
              <Link to="/users/new">{t('users:newUser')}</Link>
            </Button>
          </div>

          {query.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('users:columns.user')}</TableHead>
                    <TableHead>{t('users:columns.email')}</TableHead>
                    <TableHead>{t('users:columns.status')}</TableHead>
                    <TableHead>{t('users:columns.owner')}</TableHead>
                    <TableHead>{t('users:columns.created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((user) => (
                    <TableRow key={user.id} className="cursor-pointer">
                      <TableCell>
                        <Link
                          to="/users/$userId"
                          params={{ userId: user.id }}
                          className="hover:underline"
                        >
                          {user.displayName}
                          <span className="ml-2 text-muted-foreground">{user.identifier}</span>
                        </Link>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={statusLabel(user.status) === 'active' ? 'default' : 'secondary'}
                        >
                          {t(`common:status.${statusLabel(user.status)}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.isOwner ? '★' : ''}</TableCell>
                      <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {query.data?.nextCursor && (
                <Button
                  variant="outline"
                  onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
                >
                  {t('common:actions.loadMore')}
                </Button>
              )}
            </>
          )}
        </div>
      </AppShell>
    </RequireOwner>
  );
}
