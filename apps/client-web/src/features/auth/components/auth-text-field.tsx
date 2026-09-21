import type { AnyFieldApi } from '@tanstack/react-form';
import type { ComponentProps, ReactNode } from 'react';

import { validationMessage } from '@/features/auth/api/errors';
import { PasswordInput } from '@/features/auth/components/password-input';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

export interface AuthTextFieldProps
  extends Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'onChange' | 'onBlur' | 'type'> {
  /** The field of a generated form hook, from `form.Field`. */
  field: AnyFieldApi;
  label: ReactNode;
  type?: 'text' | 'email' | 'password';
  /** A message reported by the server for this field (see `useAuthError`). */
  serverError?: string;
}

/** Label, input and error text for one field of a generated form. */
export function AuthTextField({
  field,
  label,
  type = 'text',
  serverError,
  id,
  ...props
}: AuthTextFieldProps) {
  const { t } = useTranslation();
  const inputId = id ?? `field-${field.name}`;
  const errorId = `${inputId}-error`;

  const messages = field.state.meta.errors.map((issue) => {
    const message = validationMessage(issue);
    return 'text' in message ? message.text : t(message.key, message.values);
  });
  const error = serverError ?? messages[0];

  const inputProps = {
    id: inputId,
    name: field.name,
    value: field.state.value ?? '',
    onChange: (event: { target: { value: string } }) => field.handleChange(event.target.value),
    onBlur: field.handleBlur,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    ...props,
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      {type === 'password' ? (
        <PasswordInput {...inputProps} />
      ) : (
        <Input type={type} {...inputProps} />
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
