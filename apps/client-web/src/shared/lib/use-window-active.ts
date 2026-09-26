import { useSyncExternalStore } from 'react';

/** Whether the page is visible and its window has focus, kept current; false during server rendering. */
export function useWindowActive(): boolean {
  return useSyncExternalStore(subscribe, isWindowActive, () => false);
}

function isWindowActive(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  window.addEventListener('focus', onChange);
  window.addEventListener('blur', onChange);
  return () => {
    document.removeEventListener('visibilitychange', onChange);
    window.removeEventListener('focus', onChange);
    window.removeEventListener('blur', onChange);
  };
}
