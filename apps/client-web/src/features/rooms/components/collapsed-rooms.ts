import { useCallback, useState } from 'react';

export const COLLAPSED_ROOMS_STORAGE_KEY = 'ekoz.rooms.collapsed';

function readCollapsed(): ReadonlySet<string> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(COLLAPSED_ROOMS_STORAGE_KEY) ?? '[]');
    return new Set(
      Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

function writeCollapsed(collapsed: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(COLLAPSED_ROOMS_STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Storage unavailable: the choice just will not survive a reload.
  }
}

/**
 * The spaces collapsed in the sidebar tree, persisted in `localStorage`. Only used
 * by components that render in the browser (the tree needs a signed-in session).
 */
export function useCollapsedRooms() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = useCallback((roomId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      writeCollapsed(next);
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
