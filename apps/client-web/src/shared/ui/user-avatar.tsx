import { initials } from '@/shared/lib/initials';
import { useAvatarSrc } from '@/shared/sdk/use-avatar-src';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';

export interface UserAvatarProps {
  /** `name/server` identifier the avatar route is keyed by. */
  identifier: string | null | undefined;
  avatarUrl: string | null | undefined;
  displayName: string | null | undefined;
  className?: string;
}

/** A user's avatar; shows their initials while loading, on error and without avatar. */
export function UserAvatar({ identifier, avatarUrl, displayName, className }: UserAvatarProps) {
  const src = useAvatarSrc(identifier, avatarUrl);

  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback>{initials(displayName)}</AvatarFallback>
    </Avatar>
  );
}
