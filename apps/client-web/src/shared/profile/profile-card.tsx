import type { Member } from '@ekozhq/sdk';
import type { ReactNode } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { usePublicProfile } from '@/shared/profile/use-public-profile';
import { useUserPresence } from '@/shared/realtime/own-presence';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Skeleton } from '@/shared/ui/skeleton';
import { UserAvatar } from '@/shared/ui/user-avatar';

/** What the caller already knows about the person, shown before the profile loads. */
export interface ProfileFallback {
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ProfileCardProps {
  /** The account id, when known: keys the avatar color. */
  userId?: string;
  /** `name/server` identifier the profile is read by. */
  identifier: string;
  fallback: ProfileFallback;
  /** The room role, when the card is opened from a room member. */
  role?: Member['role'] | null;
  /** True for someone who is no longer a member of the room. */
  left?: boolean;
}

/**
 * A person's public card: avatar, name and identifier at once from `fallback`,
 * then the bio once `GET /users/:identifier` answers. Without a bio, or when the
 * profile cannot be read (`404` for a deleted account), the card keeps the
 * fallback and shows no bio.
 */
export function ProfileCard({ userId, identifier, fallback, role, left }: ProfileCardProps) {
  const { t } = useTranslation();
  const profile = usePublicProfile(identifier);
  const presence = useUserPresence(userId);
  const displayName = profile.data?.displayName ?? fallback.displayName;
  const avatarUrl = profile.data?.avatarUrl ?? fallback.avatarUrl;

  return (
    <section
      aria-label={t('members.card.label', { name: displayName ?? identifier })}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        <UserAvatar
          userId={userId}
          identifier={identifier}
          avatarUrl={avatarUrl}
          displayName={displayName}
          className="size-12"
          presence={userId ? presence : undefined}
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{displayName ?? identifier}</p>
          <p className="truncate text-sm text-muted-foreground">{identifier}</p>
        </div>
      </div>
      {profile.isPending ? (
        <div className="space-y-2" role="status" aria-label={t('members.card.loading')}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : profile.data?.bio ? (
        <p className="whitespace-pre-wrap break-words text-sm">{profile.data.bio}</p>
      ) : null}
      {role ? (
        <p className="text-sm text-muted-foreground">
          {t('members.card.role')}: {t(`members.role.${role}`)}
        </p>
      ) : null}
      {left ? <p className="text-sm text-muted-foreground">{t('members.card.left')}</p> : null}
    </section>
  );
}

export interface ProfileCardPopoverProps extends ProfileCardProps {
  /** The element that opens the card (`asChild`), or the anchor when `anchorOnly`. */
  children: ReactNode;
  /** Controlled open state; uncontrolled when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * The child only positions the card and something else opens it, through
   * `open`; used to anchor the card to a menu trigger.
   */
  anchorOnly?: boolean;
}

/**
 * Wraps a trigger so that activating it opens the {@link ProfileCard} in a
 * popover. The card, and so its query, is mounted only while the popover is open.
 */
export function ProfileCardPopover({
  children,
  open,
  onOpenChange,
  anchorOnly = false,
  ...card
}: ProfileCardPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {anchorOnly ? (
        <PopoverAnchor asChild>{children}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>{children}</PopoverTrigger>
      )}
      <PopoverContent align="start">
        <ProfileCard {...card} />
      </PopoverContent>
    </Popover>
  );
}
