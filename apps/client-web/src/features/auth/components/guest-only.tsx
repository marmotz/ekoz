import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { useSession } from '@/shared/sdk/session';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Renders `children` for an anonymous visitor, a placeholder while the session
 * is still resolving, and sends a signed-in user to `/`. A successful sign-in
 * needs no navigation of its own: `session:authenticated` flips the state and
 * this redirect follows.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === 'unknown')
    return <Skeleton className="h-32 w-full" data-testid="guest-skeleton" />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return children;
}
