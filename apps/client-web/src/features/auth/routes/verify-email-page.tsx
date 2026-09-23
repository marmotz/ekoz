import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { useVerifyEmail } from '@/features/auth/api/use-verify-email';
import { ResendVerificationForm } from '@/features/auth/components/resend-verification-form';
import { useAuthError } from '@/features/auth/hooks/use-auth-error';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useSdk } from '@/shared/sdk/use-sdk';
import { Button } from '@/shared/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { FormError } from '@/shared/ui/form-field';
import { Skeleton } from '@/shared/ui/skeleton';

const NO_FIELDS: readonly string[] = [];
const INVALID_TOKEN_CODE = 'identity.email_verification_invalid';

/**
 * Verifies the address from the mail link (`?token=`). The token is single-use and React
 * Strict Mode mounts effects twice, so the call is guarded by a ref. The page is not
 * guest-only: a signed-in user who clicks the link must not lose the token to a redirect.
 */
export function VerifyEmailPage({ token }: { token?: string }) {
  const { t } = useTranslation();
  const sdk = useSdk();
  const verify = useVerifyEmail();
  const errors = useAuthError({ fields: NO_FIELDS });
  const started = useRef(false);

  const { mutate } = verify;
  const { apply } = errors;
  useEffect(() => {
    if (!token || !sdk || started.current) return;
    started.current = true;
    mutate({ token }, { onError: apply });
  }, [token, sdk, mutate, apply]);

  const retry = () => {
    if (!token) return;
    errors.reset();
    mutate({ token }, { onError: apply });
  };

  if (verify.isSuccess) {
    return (
      <>
        <CardHeader>
          <CardTitle>{t('auth.verifyEmail.successTitle')}</CardTitle>
          <CardDescription>{t('auth.verifyEmail.successDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/login">{t('auth.verifyEmail.signIn')}</Link>
          </Button>
        </CardContent>
      </>
    );
  }

  const missingToken = !token;
  const invalidToken = errors.code === INVALID_TOKEN_CODE;
  if (missingToken || invalidToken) {
    return (
      <>
        <CardHeader>
          <CardTitle>{t('auth.verifyEmail.invalidTitle')}</CardTitle>
          <CardDescription>
            {missingToken ? t('auth.verifyEmail.missingToken') : errors.formError}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('auth.verifyEmail.resendHint')}</p>
          <ResendVerificationForm />
        </CardContent>
      </>
    );
  }

  if (verify.isError) {
    return (
      <>
        <CardHeader>
          <CardTitle>{t('auth.verifyEmail.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormError>{errors.formError}</FormError>
          <Button variant="outline" className="w-full" onClick={retry}>
            {t('auth.verifyEmail.retry')}
          </Button>
        </CardContent>
      </>
    );
  }

  return (
    <>
      <CardHeader>
        <CardTitle>{t('auth.verifyEmail.title')}</CardTitle>
        <CardDescription>{t('auth.verifyEmail.pending')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-full" data-testid="verify-email-skeleton" />
      </CardContent>
    </>
  );
}
