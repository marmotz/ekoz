import * as AvatarPrimitive from '@radix-ui/react-avatar';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

export function Avatar({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        '@container relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image className={cn('aspect-square size-full', className)} {...props} />;
}

export function AvatarFallback({
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        // Initials scale with the avatar: 40% of its width, whatever its size.
        'flex size-full items-center justify-center rounded-full bg-muted text-[length:40cqw] font-medium leading-none',
        className,
      )}
      {...props}
    />
  );
}
