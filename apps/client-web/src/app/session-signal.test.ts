import { AuthenticationError } from '@ekozhq/sdk';
import { expect, it, vi } from 'vitest';

import {
  emitUnhandledAuthenticationError,
  onUnhandledAuthenticationError,
} from '@/app/session-signal';

it('notifies subscribers until they unsubscribe', () => {
  const listener = vi.fn();
  const error = new AuthenticationError({ code: 'auth.unauthenticated', status: 401 });
  const unsubscribe = onUnhandledAuthenticationError(listener);

  emitUnhandledAuthenticationError(error);
  unsubscribe();
  emitUnhandledAuthenticationError(error);

  expect(listener).toHaveBeenCalledExactlyOnceWith(error);
});
