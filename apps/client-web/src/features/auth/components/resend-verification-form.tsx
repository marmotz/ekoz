import { useResendVerificationDtoForm } from 'api/react-tanstack/ResendVerificationDto.form';
import { useState } from 'react';

import { useResendVerification } from '@/features/auth/api/use-resend-verification';
import { useAuthError } from '@/features/auth/hooks/use-auth-error';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { FormError, FormTextField } from '@/shared/ui/form-field';

const FIELDS = ['email'] as const;

/**
 * Asks the server to send the verification email again. With a known `email` there is
 * nothing to type, one button; without it (a reload lost the router state) the address
 * is asked for. The outcome is always reported as accepted: the server does not say
 * whether the address belongs to an account.
 */
export function ResendVerificationForm({ email }: { email?: string }) {
  const { t } = useTranslation();
  const resend = useResendVerification();
  const errors = useAuthError({ fields: FIELDS });
  const [sent, setSent] = useState(false);

  const form = useResendVerificationDtoForm({
    defaultValues: { email },
    onSubmit: async ({ value }) => {
      errors.reset();
      setSent(false);
      try {
        await resend.mutateAsync({ email: value.email });
        setSent(true);
      } catch (error) {
        errors.apply(error);
      }
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {email === undefined ? (
        <form.Field name="email">
          {(field) => (
            <FormTextField
              field={field}
              label={t('auth.fields.email')}
              type="email"
              autoComplete="email"
              serverError={errors.fieldErrors.email}
            />
          )}
        </form.Field>
      ) : null}
      <FormError>{errors.formError}</FormError>
      {sent ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('auth.resend.sent')}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" variant="outline" className="w-full" disabled={isSubmitting}>
            {t('auth.resend.submit')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
