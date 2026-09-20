import type { EkozClient } from '@ekozhq/sdk';
import { createContext, useContext } from 'react';

export const SdkContext = createContext<EkozClient | null>(null);

/** The SDK client, or `null` while rendering on the server and until the client has started. */
export function useSdk(): EkozClient | null {
  return useContext(SdkContext);
}
