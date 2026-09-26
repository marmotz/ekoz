import type { PresenceStatus } from '@ekozhq/sdk';

import { avatarColors } from '@/shared/lib/avatar-color';
import { initials } from '@/shared/lib/initials';
import { useAvatarSrc } from '@/shared/sdk/use-avatar-src';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { PresenceDot } from '@/shared/ui/presence-dot';

export interface UserAvatarProps {
  /** The account id: keys the color of the initials disc, so it never changes. */
  userId?: string | null | undefined;
  /** `name/server` identifier the avatar route is keyed by. */
  identifier: string | null | undefined;
  avatarUrl: string | null | undefined;
  displayName: string | null | undefined;
  className?: string;
  /** Shows a presence dot when given; nothing when omitted. */
  presence?: PresenceStatus | undefined;
}

/** A user's avatar; shows their initials on a color of their own while loading, on error and without avatar. */
export function UserAvatar({
  userId,
  identifier,
  avatarUrl,
  displayName,
  className,
  presence,
}: UserAvatarProps) {
  const src = useAvatarSrc(identifier, avatarUrl);
  const colors = avatarColors(userId ?? identifier ?? displayName ?? '');

  const avatar = (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback style={colors}>{initials(displayName)}</AvatarFallback>
    </Avatar>
  );
  if (presence === undefined) return avatar;

  return (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <PresenceDot status={presence} className="absolute right-0 bottom-0" />
    </span>
  );
}
