import { createFileRoute, redirect } from '@tanstack/react-router';

import { NEW_CONVERSATION_PATH } from '@/features/direct-messages/lib/paths';

/** `/dms` has no page of its own: the conversations are in the sidebar, so it opens the picker. */
export const Route = createFileRoute('/_app/dms/')({
  beforeLoad: () => {
    throw redirect({ to: NEW_CONVERSATION_PATH, replace: true });
  },
});
