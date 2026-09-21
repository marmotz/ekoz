import { createFileRoute } from '@tanstack/react-router';

import { VerifyEmailPage } from '@/features/auth/routes/verify-email-page';

// Not wrapped in `GuestOnly`: a signed-in user who clicks the mail link must keep the token.
export const Route = createFileRoute('/_auth/verify-email')({
  staticData: { title: 'auth.verifyEmail.title' },
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' && search.token !== '' ? { token: search.token } : {},
  component: VerifyEmailRoute,
});

function VerifyEmailRoute() {
  const { token } = Route.useSearch();

  return <VerifyEmailPage token={token} />;
}
