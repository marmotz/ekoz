import type { EmailTemplate } from './templates/template.js';

/**
 * Outbound email port (technical.md §7). Features call `MailService.send`; the
 * configured {@link Mailer} is the transport under it.
 */

/** A rendered message ready for the transport. */
export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Transport contract. The only implementation now is the SMTP driver. */
export interface Mailer {
  send(message: OutboundEmail): Promise<void>;
  /** Best-effort transport reachability check (not used by readiness yet). */
  verify(): Promise<void>;
}

/** DI token for the configured {@link Mailer}. */
export const MAILER = Symbol('MAILER');

/**
 * Owner-customization seam for email templates (technical.md §7). A future
 * server-administration store implements this to let an owner override the
 * wording / markup of any template; `MailService` consults it before the
 * feature-registered default and merges the returned fields over that default.
 * Unbound by default — the registered templates are used as-is.
 */
export interface MailTemplateStore {
  resolve(templateName: string): Promise<Partial<EmailTemplate> | null>;
}

/** DI token for an optional {@link MailTemplateStore}. */
export const MAIL_TEMPLATE_STORE = Symbol('MAIL_TEMPLATE_STORE');

/** Arguments to {@link MailService.send}. */
export interface SendEmailArgs {
  to: string;
  /** Registered template name (a feature registers its templates on init). */
  template: string;
  /** Interpolation values for the template. */
  vars: Record<string, string | number>;
  /** Coarse classification for future rate limiting (e.g. `identity`, `security`). */
  category: string;
  /**
   * When set, a prior message with the same key is not re-sent (coarse
   * anti-duplication guard, technical.md §7). Real rate limiting is a
   * notifications concern.
   */
  dedupeKey?: string;
}
