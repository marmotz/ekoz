import { createFileRoute } from '@tanstack/react-router';

import { GuestOnly } from '@/features/auth/components/guest-only';
import { ForgotPasswordPage } from '@/features/auth/routes/forgot-password-page';

export const Route = createFileRoute('/_auth/forgot-password')({
  staticData: { title: 'auth.forgotPassword.title' },
  component: () => (
    <GuestOnly>
      <ForgotPasswordPage />
    </GuestOnly>
  ),
});
