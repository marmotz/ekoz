import type { MentionTarget } from '@ekozhq/sdk';
import { Megaphone, Shield, User, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { useRoomGroups } from '@/shared/groups/room-groups';
import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { useRoomMembers } from '@/shared/members/room-members';
import { useUserSummaries } from '@/shared/members/use-user-summaries';
import {
  MENTION_CHIP_CLASS,
  MENTION_KIND_CLASSES,
  type MentionKind,
} from '@/shared/messages/mention-style';
import { ProfileCardPopover } from '@/shared/profile/profile-card';

const KIND_ICONS = { user: User, role: Shield, group: Users, all: Megaphone } as const;

export function MentionKindIcon({ kind, className }: { kind: MentionKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return <Icon aria-hidden="true" className={cn('size-3 shrink-0', className)} />;
}

function Chip({
  kind,
  label,
  muted = false,
  children,
}: {
  kind: MentionKind;
  label: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-mention-kind={kind}
      className={cn(
        MENTION_CHIP_CLASS,
        muted ? 'bg-muted text-muted-foreground' : MENTION_KIND_CLASSES[kind],
      )}
    >
      <MentionKindIcon kind={kind} />
      <span aria-hidden="true">{children}</span>
    </span>
  );
}

function UserChip({ roomId, target }: { roomId: string; target: MentionTarget }) {
  const { t } = useTranslation();
  const userId = target.target ?? '';
  const members = useRoomMembers(roomId);
  const member = members.data?.members.find((entry) => entry.user.id === userId);
  const lookupIds = members.isSuccess && !member ? [userId] : [];
  const summaries = useUserSummaries(lookupIds);
  const summary = summaries.data?.find((entry) => entry.id === userId);

  if (member && member.user.displayName !== null) {
    const { user } = member;
    const name = user.displayName ?? user.identifier ?? target.token;
    return (
      <ProfileCardPopover
        userId={user.id}
        identifier={user.identifier ?? ''}
        fallback={{ displayName: user.displayName, avatarUrl: user.avatarUrl }}
        role={member.role}
      >
        <button
          type="button"
          data-mention-kind="user"
          aria-label={t('chat.mentions.aria.user', { name })}
          className={cn(
            MENTION_CHIP_CLASS,
            MENTION_KIND_CLASSES.user,
            'cursor-pointer hover:underline',
          )}
        >
          <MentionKindIcon kind="user" />@{name}
        </button>
      </ProfileCardPopover>
    );
  }

  if (summary && summary.displayName !== null) {
    const name = summary.displayName;
    return (
      <Chip kind="user" label={t('chat.mentions.aria.userLeft', { name })}>
        @{name} ({t('chat.mentions.markers.left')})
      </Chip>
    );
  }

  // Deleted account: its handle may now belong to someone else, so it is not shown.
  // Still loading: the raw token is all there is.
  const deleted =
    (member && member.user.displayName === null) || summary !== undefined || summaries.isError;
  return (
    <Chip
      kind="user"
      muted
      label={
        deleted
          ? t('chat.mentions.aria.userDeleted')
          : t('chat.mentions.aria.user', { name: target.token })
      }
    >
      {deleted ? t('chat.mentions.deletedAccount') : target.token}
    </Chip>
  );
}

function GroupChip({ roomId, target }: { roomId: string; target: MentionTarget }) {
  const { t } = useTranslation();
  const groups = useRoomGroups(roomId);
  const group = groups.data?.items.find((entry) => entry.id === target.target);

  if (group) {
    return (
      <Chip kind="group" label={t('chat.mentions.aria.group', { name: group.name })}>
        @{group.name}
      </Chip>
    );
  }
  // Deleted (or not visible from here): the token as it was written, muted.
  return (
    <Chip kind="group" muted label={t('chat.mentions.aria.groupDeleted')}>
      {target.token}
    </Chip>
  );
}

export interface MentionChipProps {
  /** The room the message belongs to. */
  roomId: string;
  target: MentionTarget;
}

/**
 * A mention as it reads in a message. Members open their profile card; people who
 * left and deleted accounts are marked; groups show their current name.
 */
export function MentionChip({ roomId, target }: MentionChipProps) {
  const { t } = useTranslation();

  switch (target.type) {
    case 'user':
      return <UserChip roomId={roomId} target={target} />;
    case 'group':
      return <GroupChip roomId={roomId} target={target} />;
    case 'all':
      return (
        <Chip kind="all" label={t('chat.mentions.aria.all')}>
          @{t('chat.mentions.all')}
        </Chip>
      );
    case 'role': {
      const role = t(`chat.mentions.roles.${target.target ?? ''}`, { defaultValue: target.token });
      return (
        <Chip kind="role" label={t('chat.mentions.aria.role', { role })}>
          @{role}
        </Chip>
      );
    }
  }
}
