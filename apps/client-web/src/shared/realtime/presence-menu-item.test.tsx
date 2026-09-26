import { screen } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { PresenceMenuItem } from '@/shared/realtime/presence-menu-item';
import { renderSignedIn } from '../../../test/render-signed-in';
import { createClientMock } from '../../../test/sdk-mock';

vi.mock('@/shared/ui/dropdown-menu', () => import('../../../test/dropdown-menu-mock'));
vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

it('offers to appear away, and asks the reporter for it', async () => {
  const { fake, user } = renderSignedIn(<PresenceMenuItem />);

  await user.click(await screen.findByRole('menuitem', { name: /Appear away/ }));

  expect(fake.reporterControl.reporter.setManualAway).toHaveBeenCalledWith(true);
});

it('offers to appear online while manually away, and asks the reporter for it', async () => {
  const { fake, user } = renderSignedIn(<PresenceMenuItem />);
  await screen.findByRole('menuitem', { name: /Appear away/ });

  act(() => fake.reporterControl.setState({ status: 'away', manualAway: true }));
  await user.click(await screen.findByRole('menuitem', { name: /Appear online/ }));

  expect(fake.reporterControl.reporter.setManualAway).toHaveBeenCalledWith(false);
});
