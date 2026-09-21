import { Link } from '@tanstack/react-router';
import { useLoginDtoForm } from 'api/react-tanstack/LoginDto.form';
import { LoginDtoSchema } from 'api/react-tanstack/zod/LoginDto.schema';
import { useState } from 'react';

import { useLogin } from '@/features/auth/api/use-login';
import { AuthTextField } from '@/features/auth/components/auth-text-field';
import { FormError } from '@/features/auth/components/form-error';
import { useAuthError } from '@/features/auth/hooks/use-auth-error';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';

const FIELDS = ['identifier', 'password'] as const;

// `deviceName` is not sent: the server derives it from the User-Agent.
const schema = LoginDtoSchema.omit({ deviceName: true });

/**
 * Sign-in form. Nothing navigates on success: `login` establishes the session, which
 * `GuestOnly` (wrapping the route) turns into a redirect to `/`.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const login = useLogin();
  const errors = useAuthError({ fields: FIELDS });
  // Set when the credentials were right but the email is not verified yet.
  const [unverified, setUnverified] = useState<{ email?: string } | null>(null);

  const form = useLoginDtoForm({
    schema,
    onSubmit: async ({ value }) => {
      errors.reset();
      setUnverified(null);
      const identifier = value.identifier.trim();
      try {
        await login.mutateAsync({ identifier, password: value.password });
      } catch (error) {
        const mapped = errors.apply(error);
        if (mapped.code === 'identity.email_not_verified') {
          setUnverified({ email: identifier.includes('@') ? identifier : undefined });
        }
      }
    },
  });

  return (
    <>
      <CardHeader>
        <CardTitle>{t('auth.login.title')}</CardTitle>
        <CardDescription>{t('auth.login.description')}</CardDescription>
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
          <form.Field name="identifier">
            {(field) => (
              <AuthTextField
                field={field}
                label={t('auth.fields.identifier')}
                autoComplete="username"
                autoFocus
                serverError={errors.fieldErrors.identifier}
              />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <AuthTextField
                field={field}
                label={t('auth.fields.password')}
                type="password"
                autoComplete="current-password"
                serverError={errors.fieldErrors.password}
              />
            )}
          </form.Field>
          <FormError>{errors.formError}</FormError>
          {unverified ? (
            <Button asChild variant="outline" className="w-full">
              <Link to="/check-email" state={unverified.email ? { email: unverified.email } : {}}>
                {t('auth.login.resendVerification')}
              </Link>
            </Button>
          ) : null}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {t('auth.login.submit')}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-1">
        <Button asChild variant="link" size="sm">
          <Link to="/forgot-password">{t('auth.login.forgotPassword')}</Link>
        </Button>
        <Button asChild variant="link" size="sm">
          <Link to="/register">{t('auth.login.register')}</Link>
        </Button>
      </CardFooter>
    </>
  );
}
