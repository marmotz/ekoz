import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AppFrame } from '@/app/app-frame';
import { UserMenu } from '@/features/auth/components/user-menu';
import { useRoomsLive } from '@/features/rooms/hooks/use-rooms-live';
import { useUnreadMentionsLive } from '@/shared/mentions/use-unread-mentions-live';
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

/** Keeps the unread mention counters live; inside `RequireAuth`, so it only runs signed in. */
function UnreadMentionsLive() {
  useUnreadMentionsLive();
  return null;
}

/** Keeps the rooms list, unread counters and invitations live; same mounting rule as above. */
function RoomsLive() {
  useRoomsLive();
  return null;
}

function AppLayout() {
  return (
    <AppFrame userMenu={<UserMenu />}>
      <RequireAuth>
        <UnreadMentionsLive />
        <RoomsLive />
        <Outlet />
      </RequireAuth>
    </AppFrame>
  );
}
