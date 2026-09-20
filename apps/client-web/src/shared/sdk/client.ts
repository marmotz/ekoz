import { createClient, type EkozClient } from '@ekozhq/sdk';

import { localStorageSessionStore } from '@/shared/sdk/session-store';

/**
 * Browser only: the store reads `localStorage`. Never call it while rendering on the server.
 *
 * Discovery (`server`) always resolves `https://<domain>/.well-known/ekoz`, right in
 * production but not against `apps/server`, which runs plain HTTP locally. In dev,
 * `resolveApiUrl` targets `VITE_EKOZ_SERVER` directly and skips discovery (same as
 * `apps/admin`). The dev server must list this origin in `EKOZ_HTTP__CORS_ALLOWED_ORIGINS`.
 */
export function createSdkClient(): EkozClient {
  const server = import.meta.env.VITE_EKOZ_SERVER;
  if (!server) throw new Error('VITE_EKOZ_SERVER is not set (see apps/client-web/.env.example)');

  return createClient({
    ...(import.meta.env.DEV ? { resolveApiUrl: () => server } : { server }),
    store: localStorageSessionStore(),
  });
}
