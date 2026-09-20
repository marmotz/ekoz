import type { AuthenticationError } from '@ekozhq/sdk';

type Listener = (error: AuthenticationError) => void;

const listeners = new Set<Listener>();

/**
 * Signal raised when a query or mutation fails with an `AuthenticationError`
 * nobody handled. The session layer subscribes to it to sign the user out;
 * keeping it a tiny bus here avoids `app` depending on `shared/sdk`.
 */
export function onUnhandledAuthenticationError(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitUnhandledAuthenticationError(error: AuthenticationError): void {
  for (const listener of listeners) listener(error);
}
