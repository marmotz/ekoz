import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SidebarConversations } from '@/features/direct-messages/components/sidebar-conversations';
import { StartConversationIconButton } from '@/features/direct-messages/components/start-conversation-button';
import { registerSidebarSection } from '@/shared/layout/sidebar-section-registry';
import { registerProfileCardAction } from '@/shared/profile/profile-card-action-registry';

// Below the rooms tree (order 10).
registerSidebarSection({ id: 'direct-messages', order: 20, component: SidebarConversations });

// Message a person from their profile card.
registerProfileCardAction({ id: 'start-conversation', component: StartConversationIconButton });

/**
 * Layout of every `/dms/*` page. Its import registers the conversations section in the
 * sidebar, as `rooms.tsx` registers the rooms tree. `RequireAuth` comes from the `_app` layout.
 */
export const Route = createFileRoute('/_app/dms')({
  staticData: { title: 'directMessages.title' },
  component: Outlet,
});
