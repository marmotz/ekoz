import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useSession } from '@/shared/sdk/session';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Renders `children` for an authenticated user, a placeholder while the session
 * is still resolving, and redirects anonymous users to `/login`. There is no
 * server-side guard: the session lives in the browser.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === 'unknown') return <Skeleton className="h-8 w-48" data-testid="auth-skeleton" />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}
