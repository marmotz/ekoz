import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

import { createQueryClient } from '@/app/query-client';
import { routeTree } from '@/routeTree.gen';

export function getRouter() {
  // A new client per router instance, i.e. per SSR request (technical.md §6).
  const queryClient = createQueryClient();

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient, sdk: null },
    defaultPreload: 'intent',
    scrollRestoration: true,
  });

  // Dehydrates the query cache on the server and re-hydrates it on the client.
  // `AppProviders` mounts the `QueryClientProvider` itself.
  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
