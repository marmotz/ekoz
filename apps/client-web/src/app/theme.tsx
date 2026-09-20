import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { THEME_STORAGE_KEY } from '@/app/theme-script';
import { type Theme, ThemeContext } from '@/app/use-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // `system` until mounted: the server cannot read `localStorage`, and the inline
  // script already applied the right class, so the first render must match the server's.
  const [theme, setThemeState] = useState<Theme>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Deliberate: reading `localStorage` during render would mismatch the server's HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(readStoredTheme());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const root = document.documentElement;
    if (theme !== 'system') {
      root.classList.toggle('dark', theme === 'dark');
      return undefined;
    }
    const query = window.matchMedia(DARK_QUERY);
    const apply = () => root.classList.toggle('dark', query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme, ready]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      if (next === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice just will not survive a reload.
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
