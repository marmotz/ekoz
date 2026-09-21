import { createFileRoute, Outlet } from '@tanstack/react-router';

import { useTheme } from '@/app/use-theme';
import { AuthLayout } from '@/features/auth/components/auth-layout';

/** Pathless layout of the anonymous pages (sign in, registration, ...): no sidebar. */
export const Route = createFileRoute('/_auth')({
  component: AuthRouteLayout,
});

function AuthRouteLayout() {
  const { theme, setTheme } = useTheme();

  return (
    <AuthLayout theme={theme} onThemeChange={setTheme}>
      <Outlet />
    </AuthLayout>
  );
}
