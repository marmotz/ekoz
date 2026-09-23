/**
 * `createClient(config)` input (technical.md §10).
 */

import type { EventSourceConstructor } from './resources/stream.js';
import type { SessionStore } from './session/session-store.js';

export interface ClientConfig {
  /** Server domain, e.g. `ekoz.example.com` (scheme optional). Required unless `resolveApiUrl` is set. */
  server?: string;
  /** Session persistence adapter; defaults to an in-memory store. */
  store?: SessionStore;
  /** Escape hatch for local `bun link` dev: resolve the REST base URL directly, skipping discovery. */
  resolveApiUrl?: () => string | Promise<string>;
  /** `fetch` implementation; defaults to the global. */
  fetch?: typeof fetch;
  /** `EventSource` implementation for `client.stream`; defaults to the global. */
  eventSource?: EventSourceConstructor;
}

export interface NormalisedClientConfig {
  server: string | undefined;
  store: SessionStore | undefined;
  resolveApiUrl: (() => string | Promise<string>) | undefined;
  fetch: typeof fetch | undefined;
  eventSource: EventSourceConstructor | undefined;
}

export function normaliseConfig(config: ClientConfig): NormalisedClientConfig {
  if (!config.server && !config.resolveApiUrl) {
    throw new TypeError('createClient requires either `server` or `resolveApiUrl`');
  }
  return {
    server: config.server,
    store: config.store,
    resolveApiUrl: config.resolveApiUrl,
    fetch: config.fetch,
    eventSource: config.eventSource,
  };
}
