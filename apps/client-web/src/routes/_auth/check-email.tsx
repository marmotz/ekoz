import { createFileRoute } from '@tanstack/react-router';

import { GuestOnly } from '@/features/auth/components/guest-only';
import { CheckEmailPage } from '@/features/auth/routes/check-email-page';

export const Route = createFileRoute('/_auth/check-email')({
  staticData: { title: 'auth.checkEmail.title' },
  component: () => (
    <GuestOnly>
      <CheckEmailPage />
    </GuestOnly>
  ),
});
