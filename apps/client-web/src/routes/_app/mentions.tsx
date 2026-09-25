import { createFileRoute } from '@tanstack/react-router';

import { MyMentionsList } from '@/features/mentions/components/my-mentions-list';
import { SidebarMentions } from '@/features/mentions/components/sidebar-mentions';
import { registerSidebarSection } from '@/shared/layout/sidebar-section-registry';

// Before the rooms tree (order 10).
registerSidebarSection({ id: 'mentions', order: 5, component: SidebarMentions });

/**
 * "My mentions": the messages that concern the caller, across every room. Its import
 * registers the entry, with the unread total, in the sidebar. `RequireAuth` comes from
 * the `_app` layout.
 */
export const Route = createFileRoute('/_app/mentions')({
  staticData: { title: 'mentions.title' },
  component: MyMentionsList,
});
