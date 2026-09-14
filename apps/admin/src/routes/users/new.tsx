import { type AdminCreateUserBody, AdminCreateUserBodySchema } from '@ekozhq/sdk';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import { useTranslation } from '@/shared/i18n/use-translation';
import { AppShell } from '@/shared/layout/app-shell';
import { RequireOwner } from '@/shared/sdk/require-owner';
import { useSdk } from '@/shared/sdk/session';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/sonner';

export const Route = createFileRoute('/users/new')({
  component: NewUserRoute,
});

function NewUserRoute() {
  const { t } = useTranslation(['users', 'common']);
  const sdk = useSdk();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdminCreateUserBody>({ resolver: zodResolver(AdminCreateUserBodySchema) });

  const createMutation = useMutation({
    mutationFn: (body: AdminCreateUserBody) => {
      if (!sdk) throw new Error('SDK not ready');
      return sdk.admin.users.create(body);
    },
    onSuccess: (account) => {
      toast.success(t('users:toasts.userCreated'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void navigate({ to: '/users/$userId', params: { userId: account.id } });
    },
    onError: (error) => {
      setError('root', { message: error instanceof Error ? error.message : 'Error' });
    },
  });

  return (
    <RequireOwner>
      <AppShell title={t('users:new.title')}>
        <form
          onSubmit={handleSubmit((values) => createMutation.mutate(values))}
          className="flex max-w-sm flex-col gap-3"
        >
          <Input placeholder={t('users:new.fields.email')} type="email" {...register('email')} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}

          <Input placeholder={t('users:new.fields.identifier')} {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}

          <Input placeholder={t('users:new.fields.displayName')} {...register('displayName')} />
          {errors.displayName && (
            <p className="text-sm text-destructive">{errors.displayName.message}</p>
          )}

          <Input
            placeholder={t('users:new.fields.password')}
            type="password"
            {...register('password')}
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}

          {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

          <Button type="submit" disabled={isSubmitting}>
            {t('users:new.submit')}
          </Button>
        </form>
      </AppShell>
    </RequireOwner>
  );
}
