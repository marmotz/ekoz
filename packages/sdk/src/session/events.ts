/**
 * Typed session lifecycle events (technical.md §9). A minimal `on` / `off` /
 * `once` emitter — no Node `EventEmitter` dependency, so it works unmodified in
 * a browser.
 */

export type SessionInvalidReason =
  | 'refresh_reuse'
  | 'refresh_failed'
  | 'logout'
  | 'account_suspended';

export interface SessionEventMap {
  'session:authenticated': [payload: { identifier: string | null; sessionId: string }];
  'session:refreshed': [payload: { sessionId: string }];
  'session:invalid': [payload: { reason: SessionInvalidReason }];
  'session:cleared': [payload: Record<string, never>];
}

export type SessionEventName = keyof SessionEventMap;

type Listener<Name extends SessionEventName> = (...args: SessionEventMap[Name]) => void;

// biome-ignore lint/suspicious/noExplicitAny: internal storage only; the public methods below are fully typed.
type AnyListener = (...args: any[]) => void;

export class SessionEventEmitter {
  readonly #listeners = new Map<SessionEventName, Set<AnyListener>>();

  on<Name extends SessionEventName>(name: Name, listener: Listener<Name>): () => void {
    let set = this.#listeners.get(name);
    if (!set) {
      set = new Set();
      this.#listeners.set(name, set);
    }
    set.add(listener as AnyListener);
    return () => this.off(name, listener);
  }

  off<Name extends SessionEventName>(name: Name, listener: Listener<Name>): void {
    this.#listeners.get(name)?.delete(listener as AnyListener);
  }

  once<Name extends SessionEventName>(name: Name, listener: Listener<Name>): () => void {
    const off = this.on(name, ((...args: SessionEventMap[Name]) => {
      off();
      listener(...args);
    }) as Listener<Name>);
    return off;
  }

  emit<Name extends SessionEventName>(name: Name, ...args: SessionEventMap[Name]): void {
    const set = this.#listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) {
      listener(...args);
    }
  }
}
