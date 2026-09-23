import type { EkozClient } from '@ekozhq/sdk';

import { useSdk } from '@/shared/sdk/use-sdk';

/** The SDK client, or a thrown error while it has not started (mutations only run in the browser). */
export function useStartedSdk(): () => EkozClient {
  const sdk = useSdk();

  return () => {
    if (!sdk) throw new Error('SDK not started');
    return sdk;
  };
}
