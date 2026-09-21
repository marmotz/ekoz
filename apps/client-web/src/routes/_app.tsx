import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AppFrame } from '@/app/app-frame';
import { UserMenu } from '@/features/auth/components/user-menu';

/**
 * Pathless layout of every page shown inside the application shell (sidebar and top
 * bar). A protected route lives under `routes/_app/` to get it. It sits in `routes`
 * because `app` may not import a feature, while `routes` may.
 */
export const Route = createFileRoute('/_app')({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppFrame userMenu={<UserMenu />}>
      <Outlet />
    </AppFrame>
  );
}
