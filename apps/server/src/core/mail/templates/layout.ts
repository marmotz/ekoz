/**
 * Shared email layout (technical.md §7). No template engine: `render` does
 * `${key}` substitution from a flat map, and the two layout helpers wrap a
 * template's body with a common header/footer carrying the server identity.
 */

export interface LayoutContext {
  /** `server.domain`. */
  domain: string;
  /** `server.web_url`, used for links back to the web client. */
  webUrl: string;
}

/** Replace every `${key}` in `template` with `vars[key]` (missing key → empty). */
export function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\$\{(\w+)}/g, (_, key: string) => {
    const value = vars[key];

    return value === undefined ? '' : String(value);
  });
}

/** Wrap a plain-text body with the shared header/footer. */
export function wrapText(body: string, ctx: LayoutContext): string {
  return `${body.trim()}\n\n--\n${ctx.domain}\n${ctx.webUrl}\n`;
}

/** Wrap an HTML body fragment in the shared document shell. */
export function wrapHtml(body: string, ctx: LayoutContext): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a;">',
    `<main style="max-width: 32rem; margin: 0 auto;">${body}</main>`,
    `<footer style="max-width: 32rem; margin: 2rem auto 0; color: #6b7280; font-size: 0.875rem;">`,
    `<p><a href="${ctx.webUrl}">${ctx.domain}</a></p>`,
    '</footer>',
    '</body>',
    '</html>',
  ].join('\n');
}
