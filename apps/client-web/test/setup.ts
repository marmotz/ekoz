import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Explicit even though Testing Library auto-registers it when `globals` is on.
afterEach(() => {
  cleanup();
});

// Bun/Node's own experimental global `localStorage` shadows jsdom's window.localStorage
// and refuses to work without a `--localstorage-file` flag. Replace it with a plain
// in-memory implementation so tests can rely on `window.localStorage` like a real browser.
class MemoryStorage implements Storage {
  #map = new Map<string, string>();

  get length() {
    return this.#map.size;
  }

  clear(): void {
    this.#map.clear();
  }

  getItem(key: string): string | null {
    return this.#map.has(key) ? (this.#map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#map.set(key, String(value));
  }
}

// Node-environment suites (e.g. the ESLint boundaries guard) have no `window`.
if (typeof window !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: globalThis.localStorage,
  });

  // jsdom does not implement scrollTo; TanStack Router's scroll restoration calls it on every navigation.
  window.scrollTo = () => {};

  // jsdom does not implement matchMedia.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
