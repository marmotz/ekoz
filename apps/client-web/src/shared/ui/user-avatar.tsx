import { avatarColors } from '@/shared/lib/avatar-color';
import { initials } from '@/shared/lib/initials';
import { useAvatarSrc } from '@/shared/sdk/use-avatar-src';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';

export interface UserAvatarProps {
  /** The account id: keys the color of the initials disc, so it never changes. */
  userId?: string | null | undefined;
  /** `name/server` identifier the avatar route is keyed by. */
  identifier: string | null | undefined;
  avatarUrl: string | null | undefined;
  displayName: string | null | undefined;
  className?: string;
}

/** A user's avatar; shows their initials on a color of their own while loading, on error and without avatar. */
export function UserAvatar({
  userId,
  identifier,
  avatarUrl,
  displayName,
  className,
}: UserAvatarProps) {
  const src = useAvatarSrc(identifier, avatarUrl);
  const colors = avatarColors(userId ?? identifier ?? displayName ?? '');

  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback style={colors}>{initials(displayName)}</AvatarFallback>
    </Avatar>
  );
}
