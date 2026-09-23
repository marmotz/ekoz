import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useRegisterDtoForm } from 'api/react-tanstack/RegisterDto.form';
import { RegisterDtoSchema } from 'api/react-tanstack/zod/RegisterDto.schema';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { useRegister } from '@/features/auth/api/use-register';
import { PolicyGate } from '@/features/auth/components/policy-gate';
import { useAuthError } from '@/features/auth/hooks/use-auth-error';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';
import { FormError, FormTextField } from '@/shared/ui/form-field';

const OPEN_FIELDS = ['name', 'email', 'displayName', 'password'] as const;
const INVITE_FIELDS = ['invitationToken', ...OPEN_FIELDS] as const;

function SignInLink() {
  const { t } = useTranslation();

  return (
    <Button asChild variant="link" size="sm">
      <Link to="/login">{t('auth.register.haveAccount')}</Link>
    </Button>
  );
}

function RegistrationClosed() {
  const { t } = useTranslation();

  return (
    <>
      <CardHeader>
        <CardTitle>{t('auth.register.title')}</CardTitle>
        <CardDescription>{t('auth.errors.registrationClosed')}</CardDescription>
      </CardHeader>
      <CardFooter>
        <SignInLink />
      </CardFooter>
    </>
  );
}

function RegisterForm({
  mode,
  passwordMinLength,
  invite,
}: {
  mode: 'open' | 'invite';
  passwordMinLength: number;
  invite: string | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const register = useRegister();
  const fields = mode === 'invite' ? INVITE_FIELDS : OPEN_FIELDS;
  const errors = useAuthError({ fields });
  const [closed, setClosed] = useState(false);

  // The generated schema only asks for a non-empty password: the minimum length is a
  // server setting, applied here. The invitation is required in `invite` mode only.
  const schema = useMemo(
    () =>
      RegisterDtoSchema.extend({
        password: z.string().min(passwordMinLength).max(1024),
        invitationToken: mode === 'invite' ? z.string().min(1).max(512) : z.string().optional(),
      }),
    [mode, passwordMinLength],
  );

  const form = useRegisterDtoForm({
    schema,
    defaultValues: { invitationToken: invite },
    onSubmit: async ({ value }) => {
      errors.reset();
      try {
        await register.mutateAsync({
          name: value.name.trim(),
          email: value.email.trim(),
          displayName: value.displayName.trim(),
          password: value.password,
          ...(mode === 'invite' ? { invitationToken: value.invitationToken?.trim() } : {}),
        });
        await navigate({ to: '/check-email', state: { email: value.email.trim() } });
      } catch (error) {
        const mapped = errors.apply(error);
        if (mapped.code === 'identity.registration_closed') {
          // The mode changed under the user: show the closed message and re-read the policy.
          setClosed(true);
          void queryClient.invalidateQueries({ queryKey: ['auth', 'policy'] });
        }
      }
    },
  });

  if (closed) return <RegistrationClosed />;

  return (
    <>
      <CardHeader>
        <CardTitle>{t('auth.register.title')}</CardTitle>
        <CardDescription>{t('auth.register.description')}</CardDescription>
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
          {mode === 'invite' ? (
            <form.Field name="invitationToken">
              {(field) => (
                <FormTextField
                  field={field}
                  label={t('auth.fields.invitation')}
                  autoComplete="off"
                  serverError={errors.fieldErrors.invitationToken}
                />
              )}
            </form.Field>
          ) : null}
          <form.Field name="name">
            {(field) => (
              <FormTextField
                field={field}
                label={t('auth.fields.username')}
                autoComplete="username"
                serverError={errors.fieldErrors.name}
              />
            )}
          </form.Field>
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
          <form.Field name="displayName">
            {(field) => (
              <FormTextField
                field={field}
                label={t('auth.fields.displayName')}
                autoComplete="name"
                serverError={errors.fieldErrors.displayName}
              />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <FormTextField
                field={field}
                label={t('auth.fields.password')}
                type="password"
                autoComplete="new-password"
                serverError={errors.fieldErrors.password}
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
                {t('auth.register.submit')}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
      <CardFooter>
        <SignInLink />
      </CardFooter>
    </>
  );
}

/**
 * Registration. What it shows follows the server policy: a closed message (`admin`),
 * a form with a required invitation field (`invite`, pre-filled from `?invite=`), or
 * a plain form (`open`).
 */
export function RegisterPage({ invite }: { invite?: string }) {
  const { t } = useTranslation();

  return (
    <PolicyGate title={t('auth.register.title')}>
      {(policy) =>
        policy.registrationMode === 'admin' ? (
          <RegistrationClosed />
        ) : (
          <RegisterForm
            mode={policy.registrationMode}
            passwordMinLength={policy.passwordMinLength}
            invite={invite}
          />
        )
      }
    </PolicyGate>
  );
}
