import { Link, useNavigate } from '@tanstack/react-router';
import { useConfirmPasswordResetDtoForm } from 'api/react-tanstack/ConfirmPasswordResetDto.form';
import { ConfirmPasswordResetDtoSchema } from 'api/react-tanstack/zod/ConfirmPasswordResetDto.schema';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useConfirmPasswordReset } from '@/features/auth/api/use-confirm-password-reset';
import { PolicyGate } from '@/features/auth/components/policy-gate';
import { useAuthError } from '@/features/auth/hooks/use-auth-error';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { FormError, FormTextField } from '@/shared/ui/form-field';

const FIELDS = ['newPassword'] as const;
// The server reports a weak password on `password`; this form calls it `newPassword`.
const RENAME = { password: 'newPassword' } as const;
const INVALID_TOKEN_CODE = 'auth.password_reset_invalid';

function InvalidLink({ message }: { message: string | null }) {
  const { t } = useTranslation();

  return (
    <>
      <CardHeader>
        <CardTitle>{t('auth.resetPassword.invalidTitle')}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link to="/forgot-password">{t('auth.resetPassword.requestNew')}</Link>
        </Button>
      </CardContent>
    </>
  );
}

function ResetForm({ token, passwordMinLength }: { token: string; passwordMinLength: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirmPasswordReset();
  const errors = useAuthError({ fields: FIELDS, rename: RENAME });

  const schema = useMemo(
    () =>
      ConfirmPasswordResetDtoSchema.extend({
        newPassword: z.string().min(passwordMinLength).max(1024),
      }),
    [passwordMinLength],
  );

  const form = useConfirmPasswordResetDtoForm({
    schema,
    defaultValues: { token },
    onSubmit: async ({ value }) => {
      errors.reset();
      try {
        await confirm.mutateAsync({ token, newPassword: value.newPassword });
      } catch (error) {
        errors.apply(error);
        return;
      }
      // The server revoked every session of the account: sign in again.
      toast.success(t('auth.resetPassword.success'));
      await navigate({ to: '/login' });
    },
  });

  if (errors.code === INVALID_TOKEN_CODE) return <InvalidLink message={errors.formError} />;

  return (
    <>
      <CardHeader>
        <CardTitle>{t('auth.resetPassword.title')}</CardTitle>
        <CardDescription>{t('auth.resetPassword.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="newPassword">
            {(field) => (
              <FormTextField
                field={field}
                label={t('auth.fields.newPassword')}
                type="password"
                autoComplete="new-password"
                autoFocus
                serverError={errors.fieldErrors.newPassword}
              />
            )}
          </form.Field>
          <p className="text-sm text-muted-foreground">
            {t('auth.register.passwordHint', { count: passwordMinLength })}
          </p>
          <FormError>{errors.formError}</FormError>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {t('auth.resetPassword.submit')}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </>
  );
}

/**
 * Sets a new password from the mail link (`?token=`). Not guest-only: a signed-in user
 * who clicks the link must not lose the token to a redirect.
 */
export function ResetPasswordPage({ token }: { token?: string }) {
  const { t } = useTranslation();

  if (!token) return <InvalidLink message={t('auth.resetPassword.missingToken')} />;

  return (
    <PolicyGate title={t('auth.resetPassword.title')}>
      {(policy) => <ResetForm token={token} passwordMinLength={policy.passwordMinLength} />}
    </PolicyGate>
  );
}
