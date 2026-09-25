import type { PendingJoinRequest } from '@ekozhq/sdk';
import { Link } from '@tanstack/react-router';

import { roomErrorKey } from '@/features/rooms/api/errors';
import {
  useApproveJoinRequest,
  useRejectJoinRequest,
} from '@/features/rooms/hooks/use-room-mutations';
import { useJoinRequests, useMyPermissions } from '@/features/rooms/hooks/use-room-queries';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { UserAvatar } from '@/shared/ui/user-avatar';

const MANAGE_MEMBERS = 'room.manage_members';

/**
 * `/rooms/$roomId/requests`: pending join requests of a room, approved or rejected
 * one by one. Guarded on `room.manage_members`, which the server enforces anyway.
 */
export function JoinRequestList({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const permissions = useMyPermissions(roomId);
  const allowed = permissions.data?.capabilities.includes(MANAGE_MEMBERS) ?? false;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">{t('rooms.requests.title')}</h3>
        <Link
          to="/rooms/$roomId"
          params={{ roomId }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('rooms.requests.back')}
        </Link>
      </div>
      {permissions.isPending ? (
        <Loading />
      ) : allowed ? (
        <PendingRequests roomId={roomId} />
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">
          {t('rooms.requests.forbidden')}
        </p>
      )}
    </div>
  );
}

function Loading() {
  const { t } = useTranslation();

  return (
    <div role="status" aria-label={t('rooms.requests.loading')} className="space-y-2">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function PendingRequests({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const requests = useJoinRequests(roomId);
  const approve = useApproveJoinRequest();
  const reject = useRejectJoinRequest();

  if (requests.isPending) return <Loading />;
  if (requests.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p className="text-sm text-destructive">{t('rooms.requests.error')}</p>
        <Button type="button" variant="outline" onClick={() => void requests.refetch()}>
          {t('rooms.requests.retry')}
        </Button>
      </div>
    );
  }

  const items = requests.data.pages.flatMap((page) => page.items);
  // Both mutations refresh the list even on failure: a `409` means another moderator got there first.
  const error = approve.error ?? reject.error;
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(roomErrorKey(error))}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('rooms.requests.empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((request) => (
            <JoinRequestRow
              key={request.id}
              request={request}
              busy={busy}
              onApprove={() => {
                reject.reset();
                approve.mutate({ roomId, requestId: request.id });
              }}
              onReject={() => {
                approve.reset();
                reject.mutate({ roomId, requestId: request.id });
              }}
            />
          ))}
        </ul>
      )}
      {requests.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          disabled={requests.isFetchingNextPage}
          onClick={() => void requests.fetchNextPage()}
        >
          {t('rooms.requests.loadMore')}
        </Button>
      )}
    </div>
  );
}

function JoinRequestRow({
  request,
  busy,
  onApprove,
  onReject,
}: {
  request: PendingJoinRequest;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = request;
  // A deleted account keeps its id but loses its name and identifier.
  const name = user.displayName ?? user.identifier ?? t('rooms.requests.deletedAccount');
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
    new Date(request.createdAt),
  );

  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <UserAvatar
        userId={user.id}
        identifier={user.identifier}
        avatarUrl={user.avatarUrl}
        displayName={user.displayName}
        className="size-9"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user.identifier && <span>{user.identifier} · </span>}
          {t('rooms.requests.requestedAt', { date })}
        </p>
      </div>
      <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
        {t('rooms.requests.approve')}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onReject}>
        {t('rooms.requests.reject')}
      </Button>
    </li>
  );
}
