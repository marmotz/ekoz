import type { EkozClient } from '@ekozhq/sdk';
import type { QueryClient } from '@tanstack/react-query';

export interface RouterContext {
  queryClient: QueryClient;
  /** `null` until the client-only SDK provider mounts (technical.md §7). */
  sdk: EkozClient | null;
}
