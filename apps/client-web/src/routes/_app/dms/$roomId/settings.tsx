import { createFileRoute } from '@tanstack/react-router';

import { GroupSettingsPage } from '@/features/direct-messages/components/group-settings-page';

function SettingsPage() {
  const { roomId } = Route.useParams();

  return <GroupSettingsPage roomId={roomId} />;
}

/** Group settings, rendered under the gate and header of `$roomId`. */
export const Route = createFileRoute('/_app/dms/$roomId/settings')({
  staticData: { title: 'directMessages.settings.title' },
  component: SettingsPage,
});
