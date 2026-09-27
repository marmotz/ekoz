import type { AuthPolicy } from '@ekozhq/sdk';
import type { ReactNode } from 'react';

import { useAuthPolicy } from '@/shared/auth/use-auth-policy';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { FormError } from '@/shared/ui/form-field';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Renders `children` with the server policy once it is loaded. While the SDK or the
 * policy is not ready it shows a skeleton, and if the policy cannot be loaded, an
 * error with a retry.
 */
export function PolicyGate({
  title,
  children,
}: {
  /** Card title shown next to the error. */
  title: ReactNode;
  children: (policy: AuthPolicy) => ReactNode;
}) {
  const { t } = useTranslation();
  const policy = useAuthPolicy();

  if (policy.isPending) {
    return (
      <CardContent className="pt-6">
        <Skeleton className="h-32 w-full" data-testid="policy-skeleton" />
      </CardContent>
    );
  }

  if (policy.isError) {
    return (
      <>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormError>{t('auth.errors.generic')}</FormError>
          <Button variant="outline" className="w-full" onClick={() => void policy.refetch()}>
            {t('auth.policy.retry')}
          </Button>
        </CardContent>
      </>
    );
  }

  return children(policy.data);
}
