import type { ReactNode } from 'react';

import { Sidebar } from '@/shared/layout/sidebar';
import { Topbar } from '@/shared/layout/topbar';

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
