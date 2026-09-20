import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { onUnhandledAuthenticationError } from '@/app/session-signal';
import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * Signs the user out of the UI when the session is lost: on `session:invalid`
 * (refresh failed or reused, account suspended, logout) and when a query or
 * mutation fails with an `AuthenticationError` nobody handled. Cached server
 * data is dropped and the user is sent to `/login`. Mounted once.
 */
export function SessionGuard() {
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!sdk) return undefined;

    const leave = () => {
      queryClient.clear();
      void router.navigate({ to: '/login' });
    };
    const offInvalid = sdk.on('session:invalid', leave);
    const offUnhandled = onUnhandledAuthenticationError(() => {
      void sdk.session.clear();
      leave();
    });

    return () => {
      offInvalid();
      offUnhandled();
    };
  }, [sdk, queryClient, router]);

  return null;
}
