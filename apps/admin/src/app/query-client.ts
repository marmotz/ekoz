import { QueryClient } from '@tanstack/react-query';

/**
 * A fresh client per SSR request; the client re-hydrates it once mounted
 * (technical.md §4). The SDK's own `session:invalid` event (emitted when a
 * refresh fails) is what routes unhandled auth errors to sign-out — see
 * `SessionInvalidHandler` in `app/providers.tsx`.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | undefined)?.status;
          if (status !== undefined && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
}
