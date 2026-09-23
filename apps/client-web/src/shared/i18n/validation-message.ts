import type { ParseKeys } from 'i18next';

/** A message to show: an i18n key (with its values), or text that came from the server. */
export type Message = { key: ParseKeys; values?: Record<string, number> } | { text: string };

/**
 * Message for a schema issue reported by the generated Zod schemas. The issues are
 * Zod's own (`code`, `origin`, `minimum`, ...); they are translated instead of showing
 * Zod's English text. A custom message (a refinement written at the call site) is kept.
 */
export function validationMessage(issue: unknown): Message {
  if (typeof issue === 'string') return { text: issue };
  if (typeof issue !== 'object' || issue === null) return { key: 'auth.errors.invalid' };

  const { code, origin, minimum, maximum, format, message } = issue as {
    code?: string;
    origin?: string;
    minimum?: number;
    maximum?: number;
    format?: string;
    message?: string;
  };

  if (code === 'too_small' && origin === 'string') {
    return minimum !== undefined && minimum > 1
      ? { key: 'auth.errors.tooShort', values: { count: minimum } }
      : { key: 'auth.errors.required' };
  }
  if (code === 'too_big' && origin === 'string' && maximum !== undefined) {
    return { key: 'auth.errors.tooLong', values: { count: maximum } };
  }
  if (code === 'invalid_format' && format === 'email') return { key: 'auth.errors.invalidEmail' };
  if (code === 'invalid_type') return { key: 'auth.errors.required' };
  return message ? { text: message } : { key: 'auth.errors.invalid' };
}
