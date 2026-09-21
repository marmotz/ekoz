import { createFileRoute } from '@tanstack/react-router';

import { GuestOnly } from '@/features/auth/components/guest-only';
import { RegisterPage } from '@/features/auth/routes/register-page';

export const Route = createFileRoute('/_auth/register')({
  staticData: { title: 'auth.register.title' },
  // Keeps `invite` a string; any other search parameter is dropped.
  validateSearch: (search: Record<string, unknown>): { invite?: string } =>
    typeof search.invite === 'string' && search.invite !== '' ? { invite: search.invite } : {},
  component: RegisterRoute,
});

function RegisterRoute() {
  const { invite } = Route.useSearch();

  return (
    <GuestOnly>
      <RegisterPage invite={invite} />
    </GuestOnly>
  );
}
