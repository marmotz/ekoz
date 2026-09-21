import { Link, useLocation } from '@tanstack/react-router';

import { PolicyGate } from '@/features/auth/components/policy-gate';
import { ResendVerificationForm } from '@/features/auth/components/resend-verification-form';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** Set by the registration and sign-in pages: keeps the address out of the URL. */
    email?: string;
  }
}

/**
 * What follows a registration. Whether a verification mail was sent depends on the
 * server policy, so the screen waits for it: "check your mailbox" with a resend action,
 * or "account created, you can sign in".
 */
export function CheckEmailPage() {
  const { t } = useTranslation();
  const email = useLocation({ select: (location) => location.state.email });

  return (
    <PolicyGate title={t('auth.checkEmail.title')}>
      {(policy) =>
        policy.emailVerificationRequired ? (
          <>
            <CardHeader>
              <CardTitle>{t('auth.checkEmail.title')}</CardTitle>
              <CardDescription>
                {email ? t('auth.checkEmail.sentTo', { email }) : t('auth.checkEmail.sent')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('auth.checkEmail.notReceived')}</p>
              <ResendVerificationForm email={email} />
              <Button asChild variant="link" className="w-full">
                <Link to="/login">{t('auth.checkEmail.backToSignIn')}</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>{t('auth.checkEmail.createdTitle')}</CardTitle>
              <CardDescription>{t('auth.checkEmail.createdDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/login">{t('auth.checkEmail.signIn')}</Link>
              </Button>
            </CardContent>
          </>
        )
      }
    </PolicyGate>
  );
}
