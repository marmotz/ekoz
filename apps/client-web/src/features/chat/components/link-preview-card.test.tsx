import type { LinkPreviewView } from '@ekozhq/sdk';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { LinkPreviewCard } from '@/features/chat/components/link-preview-card';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

beforeEach(() => {
  createClientMock.mockReset();
});

const preview: LinkPreviewView = {
  id: 'p1',
  url: 'https://example.test',
  title: 'Example site',
  description: 'A description',
  siteName: 'example.test',
  hasImage: true,
};

function setup(props: Partial<Parameters<typeof LinkPreviewCard>[0]> = {}) {
  const fake = createFakeSdk({ identifier: 'jane/example.test', sessionId: 's1' });
  fake.stubs.files.urls.mockResolvedValue({
    items: [
      {
        ref: { kind: 'preview', previewId: 'p1' },
        url: 'https://files.test/p1',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ],
  } as never);
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(
    <SdkProvider>
      <LinkPreviewCard
        preview={preview}
        imageRef={{ kind: 'preview', previewId: 'p1' }}
        {...props}
      />
    </SdkProvider>,
  );
  return { fake, user: userEvent.setup() };
}

it('renders the title, description and site name', async () => {
  setup();

  expect(await screen.findByText('Example site')).toBeInTheDocument();
  expect(screen.getByText('A description')).toBeInTheDocument();
  expect(screen.getByText('example.test')).toBeInTheDocument();
});

it('resolves the signed url of the image when the preview has one', async () => {
  setup();

  await waitFor(() =>
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://files.test/p1'),
  );
});

it('does not render an image without one', async () => {
  setup({ preview: { ...preview, hasImage: false } });

  await screen.findByText('Example site');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('calls onNext and onRemove from their buttons', async () => {
  const onNext = vi.fn();
  const onRemove = vi.fn();
  const { user } = setup({ onNext, nextLabel: 'Next', onRemove, removeLabel: 'Remove' });

  await user.click(await screen.findByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('button', { name: 'Remove' }));

  expect(onNext).toHaveBeenCalledTimes(1);
  expect(onRemove).toHaveBeenCalledTimes(1);
});

it('shows neither button when neither handler is given', async () => {
  setup();

  await screen.findByText('Example site');
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
