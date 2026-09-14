import { createClient, type EkozClient } from '@ekozhq/sdk';

import { localStorageSessionStore } from '@/shared/sdk/session-store';

let client: EkozClient | undefined;

/**
 * Client-only: the SDK never runs during SSR (technical.md §6).
 *
 * Discovery (`server`) always resolves `https://<domain>/.well-known/ekoz` —
 * correct in production, but `apps/server` runs plain HTTP locally with no
 * TLS. In dev, `resolveApiUrl` targets `VITE_EKOZ_SERVER` directly and skips
 * discovery (see the SDK README's "no resolvable domain" escape hatch).
 */
export function getSdkClient(): EkozClient {
  if (!client) {
    client = createClient({
      ...(import.meta.env.DEV
        ? { resolveApiUrl: () => import.meta.env.VITE_EKOZ_SERVER }
        : { server: import.meta.env.VITE_EKOZ_SERVER }),
      store: localStorageSessionStore(),
    });
  }
  return client;
}
