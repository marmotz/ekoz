import { createFileRoute } from '@tanstack/react-router';

import { ResetPasswordPage } from '@/features/auth/routes/reset-password-page';

// Not wrapped in `GuestOnly`: a signed-in user who clicks the mail link must keep the token.
export const Route = createFileRoute('/_auth/reset-password')({
  staticData: { title: 'auth.resetPassword.title' },
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' && search.token !== '' ? { token: search.token } : {},
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { token } = Route.useSearch();

  return <ResetPasswordPage token={token} />;
}
