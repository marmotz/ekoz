import { AuthenticationError, EkozError } from '@ekozhq/sdk';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { emitUnhandledAuthenticationError } from '@/app/session-signal';

function isClientError(error: unknown): boolean {
  return error instanceof EkozError && error.status >= 400 && error.status < 500;
}

function signalIfAuthenticationError(error: unknown): void {
  if (error instanceof AuthenticationError) emitUnhandledAuthenticationError(error);
}

/**
 * A NEW client per request (technical.md §6): a module-level instance would leak
 * cached data between SSR requests. Never call this at module scope.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: signalIfAuthenticationError }),
    mutationCache: new MutationCache({ onError: signalIfAuthenticationError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // One retry, except when the server already gave a definitive answer.
        retry: (failureCount, error) => {
          if (error instanceof AuthenticationError || isClientError(error)) return false;
          return failureCount < 1;
        },
      },
    },
  });
}
