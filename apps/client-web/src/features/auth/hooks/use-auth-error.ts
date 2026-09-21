import { useCallback, useState } from 'react';

import { type AuthMessage, type MappedAuthError, mapAuthError } from '@/features/auth/api/errors';
import { useTranslation } from '@/shared/i18n/use-translation';

export interface UseAuthErrorOptions {
  /** Names of the fields the form renders. A field error for another field becomes a form error. */
  fields: readonly string[];
  /** Body field name -> form field name, when the form calls a field differently. */
  rename?: Readonly<Record<string, string>>;
}

export interface AuthErrorState {
  /** Message for the form as a whole, `null` when there is none. */
  formError: string | null;
  /** Server-side field messages, by form field name. */
  fieldErrors: Readonly<Record<string, string>>;
  /** Code of the last error applied, `null` when there is none. */
  code: string | null;
  /** Shows the messages for `error` and returns how it was mapped. */
  apply: (error: unknown) => MappedAuthError;
  /** Forgets the last error; call it when a new submission starts. */
  reset: () => void;
}

/**
 * Turns an error thrown by an SDK call into messages for a form (technical.md C3):
 * one form-level message and per-field messages, translated in the current language.
 * The messages live here rather than in the form state, so a page can also react to
 * the error `code` (`identity.email_not_verified`, `identity.registration_closed`).
 */
export function useAuthError({ fields, rename = {} }: UseAuthErrorOptions): AuthErrorState {
  const { t } = useTranslation();
  const [state, setState] = useState<{
    formError: string | null;
    fieldErrors: Record<string, string>;
    code: string | null;
  }>({ formError: null, fieldErrors: {}, code: null });

  const apply = useCallback(
    (error: unknown) => {
      const translate = (message: AuthMessage) =>
        'text' in message ? message.text : t(message.key, message.values);
      const mapped = mapAuthError(error);

      let formError = mapped.form ? translate(mapped.form) : null;
      const fieldErrors: Record<string, string> = {};
      for (const { field, message } of mapped.fields) {
        const name = rename[field] ?? field;
        if (fields.includes(name)) {
          fieldErrors[name] = translate(message);
        } else {
          formError ??= translate(message);
        }
      }

      setState({ formError, fieldErrors, code: mapped.code });
      return mapped;
    },
    [t, fields, rename],
  );

  const reset = useCallback(() => {
    setState({ formError: null, fieldErrors: {}, code: null });
  }, []);

  return { ...state, apply, reset };
}
