import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AppFrame } from '@/app/app-frame';
import { UserMenu } from '@/features/auth/components/user-menu';
import { RequireAuth } from '@/shared/sdk/require-auth';

/**
 * Pathless layout of every page shown inside the application shell (sidebar and top
 * bar). Every page under `routes/_app/` is protected: the outlet is wrapped in
 * `RequireAuth`, so an anonymous visitor is sent to `/login`. It sits in `routes`
 * because `app` may not import a feature, while `routes` may.
 */
export const Route = createFileRoute('/_app')({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppFrame userMenu={<UserMenu />}>
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    </AppFrame>
  );
}
