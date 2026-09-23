import { useTranslation } from '@/shared/i18n/use-translation';
import { useConnectionStatus } from '@/shared/realtime/use-realtime';

/** Discreet notice while the live stream is not open. */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const status = useConnectionStatus();

  if (status === 'open') return null;

  return (
    <div
      role="status"
      className="border-b bg-muted px-4 py-1 text-center text-xs text-muted-foreground"
    >
      {status === 'idle' ? t('chat.connection.offline') : t('chat.connection.reconnecting')}
    </div>
  );
}
