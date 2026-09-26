import { beforeEach, expect, it } from 'vitest';

import {
  clearProfileCardActionRegistry,
  getProfileCardActions,
  registerProfileCardAction,
} from '@/shared/profile/profile-card-action-registry';

const component = () => null;

beforeEach(() => {
  clearProfileCardActionRegistry();
});

it('registers actions in order', () => {
  registerProfileCardAction({ id: 'a', component });
  registerProfileCardAction({ id: 'b', component });

  expect(getProfileCardActions().map((action) => action.id)).toEqual(['a', 'b']);
});

it('keeps the first action registered under an id', () => {
  const other = () => null;
  registerProfileCardAction({ id: 'a', component });
  registerProfileCardAction({ id: 'a', component: other });

  expect(getProfileCardActions()).toHaveLength(1);
  expect(getProfileCardActions()[0]?.component).toBe(component);
});
