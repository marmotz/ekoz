import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Toaster, toast } from '@/shared/ui/sonner';

it('exports a mountable Toaster and the toast function', () => {
  const { container } = render(<Toaster />);

  expect(container).toBeDefined();
  expect(typeof toast).toBe('function');
});
