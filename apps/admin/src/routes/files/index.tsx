import type { AdminAttachmentItem } from '@ekozhq/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Files } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { AppShell } from '@/shared/layout/app-shell';
import { registerNav } from '@/shared/layout/nav-registry';
import { formatBytes } from '@/shared/lib/bytes';
import { RequireOwner } from '@/shared/sdk/require-owner';
import { useSdk } from '@/shared/sdk/session';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

registerNav({ id: 'files', to: '/files', labelKey: 'nav.files', icon: Files });

export const Route = createFileRoute('/files/')({
  component: FilesRoute,
});

type TypeFilter = 'all' | 'media' | 'documents';

function FilesRoute() {
  const { t } = useTranslation(['files', 'common']);
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [uploaderId, setUploaderId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [toRemove, setToRemove] = useState<AdminAttachmentItem | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'attachments', { q, uploaderId, roomId, type }],
    queryFn: () =>
      sdk?.admin.attachments.search({
        q: q || undefined,
        uploaderId: uploaderId || undefined,
        roomId: roomId || undefined,
        type: type === 'all' ? undefined : type,
      }),
    enabled: !!sdk,
  });

  function requireSdk() {
    if (!sdk) throw new Error('SDK not ready');
    return sdk;
  }

  const openMutation = useMutation({
    mutationFn: async (item: AdminAttachmentItem) => {
      const result = await requireSdk().files.urls([
        { kind: 'attachment', id: item.id, variant: 'original' },
      ]);
      const first = result.items[0];
      if (!first || 'error' in first) throw new Error('files.not_found');
      return first.url;
    },
    onSuccess: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    onError: () => toast.error(t('common:errors.generic')),
  });

  const removeMutation = useMutation({
    mutationFn: (item: AdminAttachmentItem) => requireSdk().admin.blobs.remove(item.blobId),
    onSuccess: () => {
      toast.success(t('files:toasts.removed'));
      setToRemove(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'attachments'] });
    },
    onError: () => toast.error(t('common:errors.generic')),
  });

  return (
    <RequireOwner>
      <AppShell title={t('files:title')}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder={t('files:search.filename')}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className="max-w-xs"
            />
            <Input
              placeholder={t('files:search.uploader')}
              value={uploaderId}
              onChange={(event) => setUploaderId(event.target.value)}
              className="max-w-xs"
            />
            <Input
              placeholder={t('files:search.room')}
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              className="max-w-xs"
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value as TypeFilter)}
            >
              <option value="all">{t('files:search.allTypes')}</option>
              <option value="media">{t('files:search.media')}</option>
              <option value="documents">{t('files:search.documents')}</option>
            </select>
          </div>

          {query.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('files:columns.filename')}</TableHead>
                  <TableHead>{t('files:columns.size')}</TableHead>
                  <TableHead>{t('files:columns.type')}</TableHead>
                  <TableHead>{t('files:columns.room')}</TableHead>
                  <TableHead>{t('files:columns.uploader')}</TableHead>
                  <TableHead>{t('files:columns.created')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.items ?? []).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.filename}</TableCell>
                    <TableCell>{formatBytes(item.sizeBytes)}</TableCell>
                    <TableCell>{item.contentType}</TableCell>
                    <TableCell>{item.room.name ?? item.room.id}</TableCell>
                    <TableCell>
                      <Link
                        to="/users/$userId"
                        params={{ userId: item.uploader.id }}
                        className="hover:underline"
                      >
                        {item.uploader.displayName ?? item.uploader.identifier ?? item.uploader.id}
                      </Link>
                    </TableCell>
                    <TableCell>{new Date(item.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={openMutation.isPending}
                        onClick={() => openMutation.mutate(item)}
                      >
                        {t('files:actions.open')}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setToRemove(item)}>
                        {t('files:actions.removeEverywhere')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Dialog open={!!toRemove} onOpenChange={(open) => !open && setToRemove(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('files:confirm.removeTitle')}</DialogTitle>
            </DialogHeader>
            {toRemove && (
              <p className="text-sm text-muted-foreground">
                {t('files:confirm.removeDescription', { count: toRemove.refCount })}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={removeMutation.isPending}
                onClick={() => toRemove && removeMutation.mutate(toRemove)}
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
