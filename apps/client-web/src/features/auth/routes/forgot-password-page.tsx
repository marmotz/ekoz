import { Link } from '@tanstack/react-router';
import { useRequestPasswordResetDtoForm } from 'api/react-tanstack/RequestPasswordResetDto.form';
import { useState } from 'react';

import { useRequestPasswordReset } from '@/features/auth/api/use-request-password-reset';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import { FormError } from '@/features/auth/components/form-error';
import { useAuthError } from '@/features/auth/hooks/use-auth-error';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';

const FIELDS = ['email'] as const;

/**
 * Asks for a password reset mail. The server answers the same whether or not the
 * address belongs to an account, and so does the page.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const request = useRequestPasswordReset();
  const errors = useAuthError({ fields: FIELDS });
  const [sent, setSent] = useState(false);

  const form = useRequestPasswordResetDtoForm({
    onSubmit: async ({ value }) => {
      errors.reset();
      try {
        await request.mutateAsync({ email: value.email.trim() });
        setSent(true);
      } catch (error) {
        errors.apply(error);
      }
    },
  });

  return (
    <>
      <CardHeader>
        <CardTitle>{t('auth.forgotPassword.title')}</CardTitle>
        <CardDescription>
          {sent ? t('auth.forgotPassword.sent') : t('auth.forgotPassword.description')}
        </CardDescription>
      </CardHeader>
      {sent ? null : (
        <CardContent>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="email">
              {(field) => (
                <AuthTextField
                  field={field}
                  label={t('auth.fields.email')}
                  type="email"
                  autoComplete="email"
                  autoFocus
                  serverError={errors.fieldErrors.email}
                />
              )}
            </form.Field>
            <FormError>{errors.formError}</FormError>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {t('auth.forgotPassword.submit')}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      )}
      <CardFooter>
        <Button asChild variant="link" size="sm">
          <Link to="/login">{t('auth.forgotPassword.backToSignIn')}</Link>
        </Button>
      </CardFooter>
    </>
  );
}
