export const THEME_STORAGE_KEY = 'ekoz.admin.theme';

export const themeScript = `(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'system';
    var resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    if (resolved === 'dark') document.documentElement.classList.add('dark');
  } catch (_e) {}
})();`;

/** Inlined in `<head>` before hydration so the correct `.dark` class is applied without a flash (technical.md §4). */
export function ThemeScriptTag() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static, non-user-controlled anti-flash script.
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
