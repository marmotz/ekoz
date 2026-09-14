import { EkozError, type SetupOwnerBody, SetupOwnerBodySchema } from '@ekozhq/sdk';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { useSdk } from '@/shared/sdk/session';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';

export const Route = createFileRoute('/setup')({
  component: SetupRoute,
});

function SetupRoute() {
  const { t } = useTranslation('setup');
  const sdk = useSdk();
  const navigate = useNavigate();

  const stateQuery = useQuery({
    queryKey: ['setup', 'state'],
    queryFn: () => sdk?.setup.state(),
    enabled: !!sdk,
  });

  const state = stateQuery.data?.state as 'closed' | 'email-pinned' | 'token-pinned' | undefined;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SetupOwnerBody>({
    resolver: zodResolver(SetupOwnerBodySchema),
  });

  if (!state) {
    return (
      <div className="mx-auto flex h-screen max-w-sm flex-col justify-center gap-4 p-6">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (state === 'closed') {
    return (
      <div className="mx-auto flex h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <p>{t('alreadyInitialized')}</p>
        <Link to="/login" className={cn(buttonVariants({ variant: 'outline' }))}>
          {t('signInLink')}
        </Link>
      </div>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!sdk) return;
    try {
      await sdk.setup.createOwner(values);
      void navigate({ to: '/users' });
    } catch (error) {
      if (error instanceof EkozError && error.code === 'setup.closed') {
        void navigate({ to: '/login' });
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Error');
      setError('root', { message: error instanceof Error ? error.message : 'Error' });
    }
  });

  return (
    <div className="mx-auto flex h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input placeholder={t('fields.email')} type="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}

        <Input placeholder={t('fields.password')} type="password" {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}

        <Input placeholder={t('fields.identifier')} {...register('name')} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}

        <Input placeholder={t('fields.displayName')} {...register('displayName')} />
        {errors.displayName && (
          <p className="text-sm text-destructive">{errors.displayName.message}</p>
        )}

        {state === 'token-pinned' && (
          <>
            <Input placeholder={t('fields.token')} {...register('token')} />
            <p className="text-xs text-muted-foreground">{t('tokenHint')}</p>
          </>
        )}

        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

        <Button type="submit" disabled={isSubmitting}>
          {t('submit')}
        </Button>
      </form>
    </div>
  );
}
