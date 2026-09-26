import type { Group } from '@ekozhq/sdk';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

import {
  GROUP_NAME_KEYS,
  groupErrorKey,
  groupNameProblem,
} from '@/features/rooms/api/group-errors';
import {
  useAddGroupMember,
  useCreateGroup,
  useDeleteGroup,
  useGroupDetail,
  useRemoveGroupMember,
  useRenameGroup,
} from '@/features/rooms/hooks/use-group-mutations';
import { useMyPermissions, useRooms } from '@/features/rooms/hooks/use-room-queries';
import { useRoomGroups } from '@/shared/groups/room-groups';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useRoomMembers } from '@/shared/members/room-members';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { MultiSelect } from '@/shared/ui/multi-select';
import { Skeleton } from '@/shared/ui/skeleton';

const MANAGE_GROUPS = 'room.manage_groups';

/**
 * `/rooms/$roomId/groups`: the groups defined on a room or space (web-client-mentions
 * technical design C4). Groups inherited from ancestors are listed read-only. Guarded
 * on `room.manage_groups`, which the server enforces anyway.
 */
export function RoomGroups({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const permissions = useMyPermissions(roomId);
  const allowed = permissions.data?.capabilities.includes(MANAGE_GROUPS) ?? false;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">{t('rooms.groups.title')}</h3>
        <Link
          to="/rooms/$roomId"
          params={{ roomId }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('rooms.groups.back')}
        </Link>
      </div>
      {permissions.isPending ? (
        <Loading />
      ) : allowed ? (
        <GroupsManager roomId={roomId} />
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">
          {t('rooms.groups.forbidden')}
        </p>
      )}
    </div>
  );
}

function Loading() {
  const { t } = useTranslation();

  return (
    <div role="status" aria-label={t('rooms.groups.loading')} className="space-y-2">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function GroupsManager({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const groups = useRoomGroups(roomId);
  const rooms = useRooms();

  if (groups.isPending) return <Loading />;
  if (groups.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p className="text-sm text-destructive">{t('rooms.groups.error')}</p>
        <Button type="button" variant="outline" onClick={() => void groups.refetch()}>
          {t('rooms.groups.retry')}
        </Button>
      </div>
    );
  }

  const own = groups.data.items.filter((group) => !group.inherited);
  const inherited = groups.data.items.filter((group) => group.inherited);
  const originName = (nodeId: string) =>
    rooms.data?.items.find((item) => item.id === nodeId)?.name ?? t('rooms.unnamed');

  return (
    <div className="space-y-6">
      <CreateGroupForm roomId={roomId} />
      <section aria-label={t('rooms.groups.own')} className="space-y-2">
        <h4 className="text-sm font-semibold">{t('rooms.groups.own')}</h4>
        {own.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('rooms.groups.empty')}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {own.map((group) => (
              <GroupRow key={group.id} roomId={roomId} group={group} />
            ))}
          </ul>
        )}
      </section>
      {inherited.length > 0 && (
        <section aria-label={t('rooms.groups.inherited')} className="space-y-2">
          <h4 className="text-sm font-semibold">{t('rooms.groups.inherited')}</h4>
          <ul className="divide-y rounded-md border">
            {inherited.map((group) => (
              <GroupRow
                key={group.id}
                roomId={roomId}
                group={group}
                origin={originName(group.nodeId)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CreateGroupForm({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const create = useCreateGroup(roomId);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<'invalid' | 'reserved' | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = groupNameProblem(name);
    setProblem(found);
    if (found) return;
    create.mutate({ name }, { onSuccess: () => setName('') });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2" noValidate>
      <label htmlFor="group-name" className="text-sm font-medium">
        {t('rooms.groups.create.label')}
      </label>
      <div className="flex gap-2">
        <Input
          id="group-name"
          value={name}
          placeholder={t('rooms.groups.create.placeholder')}
          aria-invalid={problem !== null}
          aria-describedby="group-name-help"
          onChange={(event) => {
            setName(event.target.value);
            setProblem(null);
            create.reset();
          }}
        />
        <Button type="submit" disabled={create.isPending || name === ''}>
          {t('rooms.groups.create.submit')}
        </Button>
      </div>
      <p id="group-name-help" className="text-xs text-muted-foreground">
        {t('rooms.groups.nameHelp')}
      </p>
      {(problem || create.error) && (
        <p role="alert" className="text-sm text-destructive">
          {t(problem ? GROUP_NAME_KEYS[problem] : groupErrorKey(create.error))}
        </p>
      )}
    </form>
  );
}

function GroupRow({
  roomId,
  group,
  origin,
}: {
  roomId: string;
  group: Group;
  /** The name of the node the group is defined on, for an inherited group. */
  origin?: string;
}) {
  const { t } = useTranslation();
  const editable = !group.inherited;
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rename = useRenameGroup(roomId);
  const remove = useDeleteGroup(roomId);

  return (
    <li className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">@{group.name}</p>
          <p className="text-xs text-muted-foreground">
            {t('rooms.groups.memberCount', { count: group.memberCount })}
            {origin ? ` · ${t('rooms.groups.definedOn', { name: origin })}` : ''}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {t(expanded ? 'rooms.groups.hideMembers' : 'rooms.groups.showMembers', {
            name: group.name,
          })}
        </Button>
        {editable && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                rename.reset();
                setRenaming((open) => !open);
              }}
            >
              {t('rooms.groups.rename', { name: group.name })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                remove.reset();
                setConfirming(true);
              }}
            >
              {t('rooms.groups.delete', { name: group.name })}
            </Button>
          </>
        )}
      </div>
      {renaming && editable && (
        <RenameForm
          initial={group.name}
          pending={rename.isPending}
          error={rename.error}
          onSubmit={(name) =>
            rename.mutate({ groupId: group.id, name }, { onSuccess: () => setRenaming(false) })
          }
          onCancel={() => setRenaming(false)}
        />
      )}
      {expanded && <GroupMembers roomId={roomId} group={group} editable={editable} />}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rooms.groups.confirmDelete.title', { name: group.name })}</DialogTitle>
            <DialogDescription>{t('rooms.groups.confirmDelete.message')}</DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {t(groupErrorKey(remove.error))}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {t('rooms.groups.confirmDelete.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(group.id, { onSuccess: () => setConfirming(false) })}
            >
              {t('rooms.groups.confirmDelete.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function RenameForm({
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: string;
  pending: boolean;
  error: unknown;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<'invalid' | 'reserved' | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = groupNameProblem(name);
    setProblem(found);
    if (!found) onSubmit(name);
  };

  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <div className="flex gap-2">
        <Input
          aria-label={t('rooms.groups.newName')}
          value={name}
          aria-invalid={problem !== null}
          onChange={(event) => {
            setName(event.target.value);
            setProblem(null);
          }}
        />
        <Button type="submit" size="sm" disabled={pending || name === initial}>
          {t('rooms.groups.save')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {t('rooms.groups.cancel')}
        </Button>
      </div>
      {(problem || Boolean(error)) && (
        <p role="alert" className="text-sm text-destructive">
          {t(problem ? GROUP_NAME_KEYS[problem] : groupErrorKey(error))}
        </p>
      )}
    </form>
  );
}

function GroupMembers({
  roomId,
  group,
  editable,
}: {
  roomId: string;
  group: Group;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const detail = useGroupDetail(roomId, group.id);
  const roomMembers = useRoomMembers(roomId);
  const add = useAddGroupMember(roomId);
  const remove = useRemoveGroupMember(roomId);
  const [picked, setPicked] = useState<string[]>([]);

  if (detail.isPending) return <Loading />;
  if (detail.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t(groupErrorKey(detail.error))}
      </p>
    );
  }

  const members = detail.data.members;
  const inGroup = new Set(members.map((member) => member.id));
  const candidates = (roomMembers.data?.members ?? []).filter(
    ({ user }) => user.displayName !== null && !inGroup.has(user.id),
  );
  const error = add.error ?? remove.error;

  /** One request per member, in order; stops at the first failure and keeps the members not added yet. */
  const addPicked = async () => {
    remove.reset();
    for (const userId of picked) {
      try {
        await add.mutateAsync({ groupId: group.id, userId });
      } catch {
        return;
      }
      setPicked((current) => current.filter((id) => id !== userId));
    }
  };

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('rooms.groups.noMembers')}</p>
      ) : (
        <ul className="space-y-1">
          {members.map((member) => {
            const name =
              member.displayName ?? member.identifier ?? t('rooms.groups.deletedAccount');
            return (
              <li key={member.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {editable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => {
                      add.reset();
                      remove.mutate({ groupId: group.id, userId: member.id });
                    }}
                  >
                    {t('rooms.groups.removeMember', { name })}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <div className="flex items-end gap-2">
          <MultiSelect
            className="flex-1"
            label={t('rooms.groups.pickMember', { name: group.name })}
            placeholder={t('rooms.groups.pickPlaceholder')}
            emptyText={t('rooms.groups.pickEmpty')}
            removeLabel={(name) => t('rooms.groups.unpickMember', { name })}
            options={candidates.map(({ user }) => ({
              value: user.id,
              label: user.displayName ?? '',
            }))}
            value={picked}
            onChange={setPicked}
            disabled={add.isPending}
          />
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={picked.length === 0 || add.isPending}
            onClick={() => void addPicked()}
          >
            {t('rooms.groups.addMember')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(groupErrorKey(error))}
        </p>
      )}
    </div>
  );
}
