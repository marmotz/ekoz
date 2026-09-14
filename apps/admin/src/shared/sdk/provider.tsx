import type { EkozClient } from '@ekozhq/sdk';
import { createContext, type ReactNode, useEffect, useState } from 'react';

import { getSdkClient } from '@/shared/sdk/client';

export const SdkContext = createContext<EkozClient | null>(null);

export function SdkProvider({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<EkozClient | null>(null);

  useEffect(() => {
    const instance = getSdkClient();
    setSdk(instance);
    void instance.session.resume();
  }, []);

  return <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>;
}
