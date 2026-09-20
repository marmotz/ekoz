import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Home } from 'lucide-react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { registerNav } from '@/shared/layout/nav-registry';
import { useSdk } from '@/shared/sdk/use-sdk';
import { Skeleton } from '@/shared/ui/skeleton';

registerNav({ id: 'home', to: '/', labelKey: 'nav.home', icon: Home, order: 0 });

export const Route = createFileRoute('/')({
  staticData: { title: 'nav.home' },
  component: HomePage,
});

function ServerStatus() {
  const { t } = useTranslation();
  const sdk = useSdk();
  // `discovery.get()` is unavailable when the SDK skips discovery (dev), so reachability
  // is checked with an unauthenticated call, which works in both modes.
  const status = useQuery({
    queryKey: ['server-status'],
    queryFn: async () => {
      if (!sdk) throw new Error('SDK not started');
      const api = await sdk.discovery.apiBaseUrl();
      await sdk.setup.state();
      return { api };
    },
    enabled: sdk !== null,
  });

  if (sdk === null || status.isPending) return <Skeleton className="h-16 w-full" />;
  if (status.isError) {
    return <p className="text-destructive">{t('pages.home.serverUnreachable')}</p>;
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{t('pages.home.server')}</dt>
      <dd>{status.data.api}</dd>
    </dl>
  );
}

function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h2 className="text-2xl font-bold">{t('pages.home.title')}</h2>
      <p className="text-muted-foreground">{t('pages.home.description')}</p>
      <ServerStatus />
    </div>
  );
}
