import {
  type CreatedInvitation,
  type CreateInvitationBody,
  CreateInvitationBodySchema,
} from '@ekozhq/sdk';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useTranslation } from '@/shared/i18n/use-translation';
import { AppShell } from '@/shared/layout/app-shell';
import { registerNav } from '@/shared/layout/nav-registry';
import { RequireOwner } from '@/shared/sdk/require-owner';
import { useSdk } from '@/shared/sdk/session';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

registerNav({ id: 'invitations', to: '/invitations', labelKey: 'nav.invitations', icon: Mail });

export const Route = createFileRoute('/invitations')({
  component: InvitationsRoute,
});

function InvitationsRoute() {
  const { t } = useTranslation(['invitations', 'common']);
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['invitations'],
    queryFn: () => sdk?.invitations.list(),
    enabled: !!sdk,
  });

  const { register, handleSubmit, reset } = useForm<CreateInvitationBody>({
    resolver: zodResolver(CreateInvitationBodySchema),
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateInvitationBody) => {
      if (!sdk) throw new Error('SDK not ready');
      return sdk.invitations.create(body);
    },
    onSuccess: (invitation) => {
      setCreateOpen(false);
      setCreated(invitation);
      reset();
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => {
      if (!sdk) throw new Error('SDK not ready');
      return sdk.invitations.revoke(id);
    },
    onSuccess: () => {
      toast.success(t('invitations:revoke.toast'));
      setRevokeId(null);
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });

  return (
    <RequireOwner>
      <AppShell title={t('invitations:title')}>
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateOpen(true)}>{t('invitations:new.title')}</Button>
          </div>

          {listQuery.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invitations:columns.email')}</TableHead>
                  <TableHead>{t('invitations:columns.created')}</TableHead>
                  <TableHead>{t('invitations:columns.expiry')}</TableHead>
                  <TableHead>{t('invitations:columns.status')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.data?.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email ?? '—'}</TableCell>
                    <TableCell>{new Date(invitation.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(invitation.expiresAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {invitation.consumedAt
                        ? t('invitations:status.used')
                        : t('invitations:status.pending')}
                    </TableCell>
                    <TableCell>
                      {!invitation.consumedAt && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRevokeId(invitation.id)}
                        >
                          {t('invitations:revoke.action')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('invitations:new.title')}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={handleSubmit((values) => createMutation.mutate(values))}
              className="flex flex-col gap-3"
            >
              <Input
                placeholder={t('invitations:new.email')}
                type="email"
                {...register('email', { setValueAs: (v) => (v === '' ? undefined : v) })}
              />
              <Input
                placeholder={t('invitations:new.expiresInDays')}
                type="number"
                {...register('expiresInDays', {
                  setValueAs: (v) => (v === '' ? undefined : Number(v)),
                })}
              />
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {t('invitations:new.submit')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!created} onOpenChange={(open) => !open && setCreated(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('invitations:created.title')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t('invitations:created.description')}</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={created?.token ?? ''} />
              <Button
                variant="outline"
                onClick={() => {
                  if (created) {
                    void navigator.clipboard.writeText(created.token);
                    toast.success(t('invitations:created.copied'));
                  }
                }}
              >
                {t('common:actions.copy')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('invitations:revoke.confirmTitle')}</DialogTitle>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={() => revokeId && revokeMutation.mutate(revokeId)}
                disabled={revokeMutation.isPending}
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
