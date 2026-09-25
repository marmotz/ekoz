import type { Member } from '@ekozhq/sdk';

import { useTranslation } from '@/shared/i18n/use-translation';
import { ProfileCardPopover } from '@/shared/profile/profile-card';
import { UserAvatar } from '@/shared/ui/user-avatar';

/** One member; the row opens their profile card, with their role. */
export function MemberRow({ member }: { member: Member }) {
  const { t } = useTranslation();
  const { user } = member;
  if (user.identifier === null) return null;

  return (
    <li>
      <ProfileCardPopover
        userId={user.id}
        identifier={user.identifier}
        fallback={{ displayName: user.displayName, avatarUrl: user.avatarUrl }}
        role={member.role}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-2"
        >
          <UserAvatar
            userId={user.id}
            identifier={user.identifier}
            avatarUrl={user.avatarUrl}
            displayName={user.displayName}
            className="size-7"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{user.displayName ?? user.identifier}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.identifier}</span>
          </span>
          <span className="sr-only">{t(`members.role.${member.role}`)}</span>
        </button>
      </ProfileCardPopover>
    </li>
  );
}
