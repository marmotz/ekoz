export const THEME_STORAGE_KEY = 'ekoz.theme';

/**
 * Inline script (IIFE) injected in `<head>` before the first paint: applies the
 * `dark` class from the stored choice so the page does not flash the wrong theme.
 */
export const themeScript = `(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = stored === 'dark' ||
      (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (_e) {}
})();`;
