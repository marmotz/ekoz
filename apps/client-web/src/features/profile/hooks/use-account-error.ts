import { useCallback, useState } from 'react';

import { type MappedAccountError, mapAccountError } from '@/features/profile/api/error-messages';
import { useTranslation } from '@/shared/i18n/use-translation';

export interface AccountErrorState {
  /** Translated message of the last error, `null` when there is none. */
  message: string | null;
  /** Code of the last error, `null` when there is none. */
  code: string | null;
  /** Shows the message for `error` and returns how it was mapped. */
  apply: (error: unknown) => MappedAccountError;
  /** Forgets the last error; call it when a new submission starts. */
  reset: () => void;
}

/** Message of the last failed call of one section, in the current language. */
export function useAccountError(): AccountErrorState {
  const { t } = useTranslation();
  const [state, setState] = useState<{ message: string | null; code: string | null }>({
    message: null,
    code: null,
  });

  const apply = useCallback(
    (error: unknown) => {
      const mapped = mapAccountError(error);
      setState({
        message:
          'text' in mapped.message
            ? mapped.message.text
            : t(mapped.message.key, mapped.message.values),
        code: mapped.code,
      });
      return mapped;
    },
    [t],
  );

  const reset = useCallback(() => setState({ message: null, code: null }), []);

  return { ...state, apply, reset };
}
