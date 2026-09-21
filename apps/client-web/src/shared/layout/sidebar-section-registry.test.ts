import { beforeEach, expect, it } from 'vitest';

import {
  clearSidebarSectionRegistry,
  getSidebarSections,
  registerSidebarSection,
} from '@/shared/layout/sidebar-section-registry';

const component = () => null;

beforeEach(() => {
  clearSidebarSectionRegistry();
});

it('registers sections', () => {
  registerSidebarSection({ id: 'rooms', component });

  expect(getSidebarSections().map((section) => section.id)).toEqual(['rooms']);
});

it('ignores a second registration of the same id', () => {
  const other = () => null;
  registerSidebarSection({ id: 'rooms', component });
  registerSidebarSection({ id: 'rooms', component: other });

  expect(getSidebarSections()).toEqual([{ id: 'rooms', component }]);
});

it('orders sections by their order key, unordered ones last', () => {
  registerSidebarSection({ id: 'last', component });
  registerSidebarSection({ id: 'second', order: 2, component });
  registerSidebarSection({ id: 'first', order: 1, component });

  expect(getSidebarSections().map((section) => section.id)).toEqual(['first', 'second', 'last']);
});

it('empties the registry', () => {
  registerSidebarSection({ id: 'rooms', component });
  clearSidebarSectionRegistry();

  expect(getSidebarSections()).toEqual([]);
});
