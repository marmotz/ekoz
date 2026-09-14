import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AtSign } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { AppShell } from '@/shared/layout/app-shell';
import { registerNav } from '@/shared/layout/nav-registry';
import { RequireOwner } from '@/shared/sdk/require-owner';
import { useSdk } from '@/shared/sdk/session';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

registerNav({
  id: 'username-requests',
  to: '/username-requests',
  labelKey: 'nav.usernameRequests',
  icon: AtSign,
});

export const Route = createFileRoute('/username-requests')({
  component: UsernameRequestsRoute,
});

type StatusFilter = 'pending' | 'approved' | 'rejected';

function UsernameRequestsRoute() {
  const { t } = useTranslation('invitations');
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('pending');

  const listQuery = useQuery({
    queryKey: ['admin', 'username-requests', status],
    queryFn: () => sdk?.admin.usernameRequests.list(status),
    enabled: !!sdk,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'username-requests'] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => {
      if (!sdk) throw new Error('SDK not ready');
      return sdk.admin.usernameRequests.approve(id);
    },
    onSuccess: (result) => {
      toast.success(t('usernameRequests.toasts.approved', { identifier: result.identifier }));
      void invalidate();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => {
      if (!sdk) throw new Error('SDK not ready');
      return sdk.admin.usernameRequests.reject(id);
    },
    onSuccess: () => {
      toast.success(t('usernameRequests.toasts.rejected'));
      void invalidate();
    },
  });

  return (
    <RequireOwner>
      <AppShell title={t('usernameRequests.title')}>
        <div className="flex flex-col gap-4">
          <select
            className="h-9 w-fit rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option value="pending">{t('usernameRequests.filters.pending')}</option>
            <option value="approved">{t('usernameRequests.filters.approved')}</option>
            <option value="rejected">{t('usernameRequests.filters.rejected')}</option>
          </select>

          {listQuery.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('usernameRequests.columns.requested')}</TableHead>
                  <TableHead>{t('usernameRequests.columns.created')}</TableHead>
                  {status === 'pending' && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.data?.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.requestedName}</TableCell>
                    <TableCell>{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                    {status === 'pending' && (
                      <TableCell className="flex gap-2">
                        <Button size="sm" onClick={() => approveMutation.mutate(request.id)}>
                          {t('usernameRequests.actions.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectMutation.mutate(request.id)}
                        >
                          {t('usernameRequests.actions.reject')}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </AppShell>
    </RequireOwner>
  );
}
