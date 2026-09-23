import type { AnyFieldApi } from '@tanstack/react-form';
import type { ComponentProps, ReactNode } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { validationMessage } from '@/shared/i18n/validation-message';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PasswordInput } from '@/shared/ui/password-input';
import { Textarea } from '@/shared/ui/textarea';

export interface FormTextFieldProps
  extends Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'onChange' | 'onBlur' | 'type'> {
  /** The field of a generated form hook, from `form.Field`. */
  field: AnyFieldApi;
  label: ReactNode;
  type?: 'text' | 'email' | 'password' | 'textarea';
  /** A message reported by the server for this field (see `useAuthError`). */
  serverError?: string;
  /** Visible lines of a `textarea`. */
  rows?: number;
}

/** Label, input and error text for one field of a generated form. */
export function FormTextField({
  field,
  label,
  type = 'text',
  serverError,
  id,
  ...props
}: FormTextFieldProps) {
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
      ) : type === 'textarea' ? (
        <Textarea {...(inputProps as ComponentProps<'textarea'>)} />
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

/** Form-level error message, `null` renders nothing. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;

  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
    >
      {children}
    </p>
  );
}
