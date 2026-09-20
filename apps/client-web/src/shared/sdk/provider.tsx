import type { EkozClient } from '@ekozhq/sdk';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { createSdkClient } from '@/shared/sdk/client';
import { SdkContext } from '@/shared/sdk/use-sdk';

async function startClient(): Promise<EkozClient> {
  const client = createSdkClient();
  try {
    // A no-op without a stored refresh token; otherwise mints a fresh access token.
    await client.session.resume();
  } catch {
    // `resume()` reports failures through `session:invalid`; the client stays usable.
  }
  return client;
}

/**
 * Creates the SDK client once the app is mounted in the browser. The server
 * render (and the first client render) provide `null`, so nothing touches
 * `localStorage` before hydration. The client is published once `resume()` has
 * settled: until then `useSession()` reports `unknown`, not a premature `anonymous`.
 */
export function SdkProvider({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<EkozClient | null>(null);
  // Kept in a ref so a remount (Strict Mode) reuses the client instead of racing two
  // `resume()` calls on the same rotating refresh token.
  const started = useRef<Promise<EkozClient> | null>(null);

  useEffect(() => {
    let cancelled = false;
    started.current ??= startClient();
    void started.current.then((client) => {
      if (!cancelled) setSdk(client);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>;
}
