import { type LayoutContext, render, wrapHtml, wrapText } from './layout.js';

/**
 * One email template (technical.md §7). `subject` / `text` / `html` are format
 * strings with `${var}` placeholders; the loader interpolates them against the
 * call's `vars` and wraps `text` / `html` in the shared layout.
 *
 * Templates live in `src/core/mail/templates/<name>.ts` and are registered by
 * the feature that owns them (identity registers verification / reset) via
 * `MailService.registerTemplate`.
 */
export interface EmailTemplate {
  subject: string;
  /** Plain-text body fragment (wrapped by the layout footer). */
  text: string;
  /** HTML body fragment (wrapped by the layout shell). */
  html: string;
}

export interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
}

export function renderTemplate(
  template: EmailTemplate,
  vars: Record<string, string | number>,
  layout: LayoutContext,
): RenderedTemplate {
  return {
    subject: render(template.subject, vars),
    text: wrapText(render(template.text, vars), layout),
    html: wrapHtml(render(template.html, vars), layout),
  };
}
