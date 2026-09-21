import { createFileRoute } from '@tanstack/react-router';

import { GuestOnly } from '@/features/auth/components/guest-only';
import { LoginPage } from '@/features/auth/routes/login-page';

/** Target of the `RequireAuth` and `session:invalid` redirects. */
export const Route = createFileRoute('/_auth/login')({
  staticData: { title: 'auth.login.title' },
  component: () => (
    <GuestOnly>
      <LoginPage />
    </GuestOnly>
  ),
});
