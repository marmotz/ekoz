import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { i18n } from 'i18next';
import { type ReactNode, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createQueryClient } from '@/app/query-client';
import { ThemeProvider } from '@/app/theme';
import { SdkProvider } from '@/shared/sdk/provider';
import { useSdk } from '@/shared/sdk/session';
import { Toaster } from '@/shared/ui/sonner';

/** Navigates to `/login` and clears cached queries on `session:invalid` (technical.md §6). */
function SessionInvalidHandler({ children }: { children: ReactNode }) {
  const sdk = useSdk();
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!sdk) return undefined;
    return sdk.on('session:invalid', () => {
      queryClient.clear();
      void router.navigate({ to: '/login' });
    });
  }, [sdk, queryClient, router]);

  return children;
}

export function AppProviders({
  children,
  queryClient,
  i18nInstance,
}: {
  children: ReactNode;
  queryClient: ReturnType<typeof createQueryClient>;
  i18nInstance: i18n;
}) {
  return (
    <I18nextProvider i18n={i18nInstance}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SdkProvider>
            <SessionInvalidHandler>{children}</SessionInvalidHandler>
            <Toaster />
          </SdkProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
