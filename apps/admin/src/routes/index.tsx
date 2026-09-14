import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useSdk } from '@/shared/sdk/session';
import { Skeleton } from '@/shared/ui/skeleton';

export const Route = createFileRoute('/')({
  component: IndexRoute,
});

/**
 * The SDK is client-only, so setup-state resolution happens here rather than
 * in a router `loader` (technical.md §6): `closed` → `/login`,
 * a pinned state → `/setup`, otherwise `/users`.
 */
function IndexRoute() {
  const sdk = useSdk();
  const navigate = useNavigate();

  const stateQuery = useQuery({
    queryKey: ['setup', 'state'],
    queryFn: () => sdk?.setup.state(),
    enabled: !!sdk,
  });

  useEffect(() => {
    if (!stateQuery.data) return;
    // `SetupStateResponse.state` comes through the generated SDK types as `unknown`
    // (the OpenAPI enum did not resolve — a kurotako generator gap, not fixable here).
    // Actual values are `'closed' | 'email-pinned' | 'token-pinned'` (server/setup.service.ts).
    const state = stateQuery.data.state as 'closed' | 'email-pinned' | 'token-pinned';
    if (state === 'closed') {
      void navigate({ to: '/login' });
    } else {
      void navigate({ to: '/setup' });
    }
  }, [stateQuery.data, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}
