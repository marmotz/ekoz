import { expect, it } from 'vitest';

import { MyMentionsList } from '@/features/mentions/components/my-mentions-list';
import { SidebarMentions } from '@/features/mentions/components/sidebar-mentions';
import { Route } from '@/routes/_app/mentions';
import { Route as RoomsLayout } from '@/routes/_app/rooms';
import { getSidebarSections } from '@/shared/layout/sidebar-section-registry';

it('registers My mentions in the sidebar, before the rooms tree', () => {
  const sections = getSidebarSections().map((section) => section.id);

  expect(getSidebarSections()).toContainEqual(
    expect.objectContaining({ id: 'mentions', component: SidebarMentions }),
  );
  expect(RoomsLayout).toBeDefined();
  expect(sections.indexOf('mentions')).toBeLessThan(sections.indexOf('rooms'));
});

it('titles the page and serves the list', () => {
  expect(Route.options.staticData?.title).toBe('mentions.title');
  expect(Route.options.component).toBe(MyMentionsList);
});
