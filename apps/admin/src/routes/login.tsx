import {
  AccountSuspendedError,
  InvalidCredentialsError,
  type LoginBody,
  LoginBodySchema,
} from '@ekozhq/sdk';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useTranslation } from '@/shared/i18n/use-translation';
import { useSdk, useSession } from '@/shared/sdk/session';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

export const Route = createFileRoute('/login')({
  component: LoginRoute,
});

function LoginRoute() {
  const { t } = useTranslation('setup');
  const sdk = useSdk();
  const status = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'authenticated') void navigate({ to: '/users' });
  }, [status, navigate]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginBody>({
    resolver: zodResolver(LoginBodySchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!sdk) return;
    try {
      await sdk.auth.login(values);
      void navigate({ to: '/users' });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        setError('root', { message: t('auth.invalidCredentials') });
        return;
      }
      if (error instanceof AccountSuspendedError) {
        setError('root', { message: t('auth.accountSuspended') });
        return;
      }
      setError('root', { message: error instanceof Error ? error.message : 'Error' });
    }
  });

  return (
    <div className="mx-auto flex h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-lg font-semibold">{t('auth.loginTitle')}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input placeholder={t('auth.identifier')} {...register('identifier')} />
        {errors.identifier && (
          <p className="text-sm text-destructive">{errors.identifier.message}</p>
        )}

        <Input placeholder={t('auth.password')} type="password" {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}

        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

        <Button type="submit" disabled={isSubmitting}>
          {t('auth.submit')}
        </Button>
      </form>
    </div>
  );
}
