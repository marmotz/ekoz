import { LastOwnerError, type SuspendUserBody, SuspendUserBodySchema } from '@ekozhq/sdk';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from '@/shared/i18n/use-translation';
import { AppShell } from '@/shared/layout/app-shell';
import {
  type ByteUnit,
  bytesToUnitAmount,
  formatBytes,
  unitAmountToBytes,
} from '@/shared/lib/bytes';
import { RequireOwner } from '@/shared/sdk/require-owner';
import { useSdk } from '@/shared/sdk/session';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';

export const Route = createFileRoute('/users/$userId')({
  component: UserDetailRoute,
});

function asStatus(status: unknown): 'active' | 'suspended' | 'deleted' {
  return status as 'active' | 'suspended' | 'deleted';
}

function UserDetailRoute() {
  const { userId } = Route.useParams();
  const { t } = useTranslation(['users', 'common']);
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['admin', 'users', userId],
    queryFn: () => sdk?.admin.users.get(userId),
    enabled: !!sdk,
  });

  const ownerCountQuery = useQuery({
    queryKey: ['admin', 'users', 'owner-count'],
    queryFn: () => sdk?.admin.users.list({ owner: true, limit: 2 }),
    enabled: !!sdk && !!detailQuery.data?.isOwner,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  function requireSdk() {
    if (!sdk) throw new Error('SDK not ready');
    return sdk;
  }

  const suspendForm = useForm<SuspendUserBody>({ resolver: zodResolver(SuspendUserBodySchema) });

  const suspendMutation = useMutation({
    mutationFn: (body: SuspendUserBody) => requireSdk().admin.users.suspend(userId, body),
    onSuccess: () => {
      toast.success(t('users:toasts.suspended'));
      setSuspendOpen(false);
      void invalidate();
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: () => requireSdk().admin.users.unsuspend(userId),
    onSuccess: () => {
      toast.success(t('users:toasts.unsuspended'));
      void invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => requireSdk().admin.users.delete(userId),
    onSuccess: () => {
      toast.success(t('users:toasts.deleted'));
      setDeleteOpen(false);
      void invalidate();
    },
  });

  const passwordResetMutation = useMutation({
    mutationFn: () => requireSdk().admin.users.triggerPasswordReset(userId),
    onSuccess: () => toast.success(t('users:toasts.passwordResetSent')),
  });

  const grantOwnerMutation = useMutation({
    mutationFn: () => requireSdk().admin.owners.add({ userId }),
    onSuccess: () => {
      toast.success(t('users:toasts.ownerGranted'));
      void invalidate();
    },
  });

  const revokeOwnerMutation = useMutation({
    mutationFn: () => requireSdk().admin.owners.remove(userId),
    onSuccess: () => {
      toast.success(t('users:toasts.ownerRevoked'));
      void invalidate();
    },
    onError: (error) => {
      if (error instanceof LastOwnerError) {
        toast.error(t('users:errors.lastOwner'));
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Error');
    },
  });

  return (
    <RequireOwner>
      <AppShell title={detailQuery.data?.displayName ?? ''}>
        {detailQuery.isPending || !detailQuery.data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="flex flex-col gap-6">
            <UserDetailBody
              user={detailQuery.data}
              isLastOwner={(ownerCountQuery.data?.items.length ?? 2) <= 1}
              onSuspend={() => setSuspendOpen(true)}
              onUnsuspend={() => unsuspendMutation.mutate()}
              onDelete={() => setDeleteOpen(true)}
              onTriggerPasswordReset={() => passwordResetMutation.mutate()}
              onGrantOwner={() => grantOwnerMutation.mutate()}
              onRevokeOwner={() => revokeOwnerMutation.mutate()}
            />
            <StorageCard userId={userId} />
          </div>
        )}

        <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('users:confirm.suspendTitle')}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={suspendForm.handleSubmit((values) => suspendMutation.mutate(values))}
              className="flex flex-col gap-3"
            >
              <Input
                placeholder={t('users:confirm.suspendReason')}
                {...suspendForm.register('reason')}
              />
              {suspendForm.formState.errors.reason && (
                <p className="text-sm text-destructive">
                  {suspendForm.formState.errors.reason.message}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={suspendMutation.isPending}>
                  {t('common:actions.confirm')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('users:confirm.deleteTitle')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t('users:confirm.deleteDescription')}</p>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {t('common:actions.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </RequireOwner>
  );
}

function UserDetailBody({
  user,
  isLastOwner,
  onSuspend,
  onUnsuspend,
  onDelete,
  onTriggerPasswordReset,
  onGrantOwner,
  onRevokeOwner,
}: {
  user: {
    identifier: string | null;
    email: string | null;
    emailVerified: boolean;
    status: unknown;
    isOwner: boolean;
    createdAt: string | Date;
    activeSessionCount: number;
  };
  isLastOwner: boolean;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onDelete: () => void;
  onTriggerPasswordReset: () => void;
  onGrantOwner: () => void;
  onRevokeOwner: () => void;
}) {
  const { t } = useTranslation(['users', 'common']);
  const status = asStatus(user.status);
  const isDeleted = status === 'deleted';

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">{t('users:detail.identifier')}</dt>
          <dd>{user.identifier}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('users:detail.email')}</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('users:detail.status')}</dt>
          <dd>
            <Badge variant={status === 'active' ? 'default' : 'secondary'}>
              {t(`common:status.${status}`)}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('users:detail.owner')}</dt>
          <dd>{user.isOwner ? '★' : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('users:detail.created')}</dt>
          <dd>{new Date(user.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('users:detail.activeSessions')}</dt>
          <dd>{user.activeSessionCount}</dd>
        </div>
      </dl>

      {!isDeleted && (
        <div className="flex flex-wrap gap-2">
          {status === 'active' ? (
            <Button variant="outline" onClick={onSuspend}>
              {t('users:actions.suspend')}
            </Button>
          ) : (
            <Button variant="outline" onClick={onUnsuspend}>
              {t('users:actions.unsuspend')}
            </Button>
          )}
          <Button variant="outline" onClick={onTriggerPasswordReset}>
            {t('users:actions.triggerPasswordReset')}
          </Button>
          {user.isOwner ? (
            !isLastOwner && (
              <Button variant="outline" onClick={onRevokeOwner}>
                {t('users:actions.revokeOwner')}
              </Button>
            )
          ) : (
            <Button variant="outline" onClick={onGrantOwner}>
              {t('users:actions.grantOwner')}
            </Button>
          )}
          <Button variant="destructive" onClick={onDelete}>
            {t('users:actions.delete')}
          </Button>
        </div>
      )}
    </div>
  );
}

type QuotaMode = 'default' | 'custom' | 'unlimited';

function StorageCard({ userId }: { userId: string }) {
  const { t } = useTranslation(['storage', 'common']);
  const sdk = useSdk();
  const queryClient = useQueryClient();

  const storageQuery = useQuery({
    queryKey: ['admin', 'users', userId, 'storage'],
    queryFn: () => sdk?.admin.users.storage(userId),
    enabled: !!sdk,
  });

  function requireSdk() {
    if (!sdk) throw new Error('SDK not ready');
    return sdk;
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId, 'storage'] });

  const setQuotaMutation = useMutation({
    mutationFn: (quotaBytes: string | null) =>
      requireSdk().admin.users.setStorageQuota(userId, quotaBytes),
    onSuccess: () => {
      toast.success(t('common:actions.save'));
      void invalidate();
    },
  });

  const resetQuotaMutation = useMutation({
    mutationFn: () => requireSdk().admin.users.resetStorageQuota(userId),
    onSuccess: () => void invalidate(),
  });

  if (storageQuery.isPending || !storageQuery.data) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <StorageCardBody
      data={storageQuery.data}
      saving={setQuotaMutation.isPending || resetQuotaMutation.isPending}
      onSetQuota={(quotaBytes) => setQuotaMutation.mutate(quotaBytes)}
      onReset={() => resetQuotaMutation.mutate()}
    />
  );
}

function StorageCardBody({
  data,
  saving,
  onSetQuota,
  onReset,
}: {
  data: { usedBytes: string; pendingBytes: string; quotaBytes: string | null; overridden: boolean };
  saving: boolean;
  onSetQuota: (quotaBytes: string | null) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation(['storage', 'common']);
  const initialMode: QuotaMode = !data.overridden
    ? 'default'
    : data.quotaBytes === null
      ? 'unlimited'
      : 'custom';
  const initialAmount =
    data.quotaBytes !== null
      ? bytesToUnitAmount(Number(data.quotaBytes))
      : { amount: 0, unit: 'GB' as ByteUnit };

  const [mode, setMode] = useState<QuotaMode>(initialMode);
  const [amount, setAmount] = useState(String(initialAmount.amount));
  const [unit, setUnit] = useState<ByteUnit>(initialAmount.unit);

  const dirty =
    mode !== initialMode ||
    (mode === 'custom' && (amount !== String(initialAmount.amount) || unit !== initialAmount.unit));

  function handleSave() {
    if (mode === 'default') {
      onReset();
      return;
    }
    if (mode === 'unlimited') {
      onSetQuota(null);
      return;
    }
    onSetQuota(String(unitAmountToBytes(Number(amount), unit)));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">{t('storage:userCard.title')}</h2>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">{t('storage:userCard.used')}</dt>
          <dd>{formatBytes(data.usedBytes)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('storage:userCard.pending')}</dt>
          <dd>{formatBytes(data.pendingBytes)}</dd>
        </div>
      </dl>
      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={mode}
          onChange={(event) => setMode(event.target.value as QuotaMode)}
        >
          <option value="default">{t('storage:userCard.override.default')}</option>
          <option value="custom">{t('storage:userCard.override.custom')}</option>
          <option value="unlimited">{t('storage:userCard.override.unlimited')}</option>
        </select>
        {mode === 'custom' && (
          <>
            <Input
              type="number"
              min={0}
              className="w-28"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={unit}
              onChange={(event) => setUnit(event.target.value as ByteUnit)}
            >
              <option value="MB">MB</option>
              <option value="GB">GB</option>
            </select>
          </>
        )}
        {dirty && (
          <Button size="sm" disabled={saving} onClick={handleSave}>
            {t('storage:userCard.save')}
          </Button>
        )}
      </div>
    </div>
  );
}
