import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Button } from '@/shared/ui/button';

it('renders a button with its label', () => {
  render(<Button>Save</Button>);

  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});

it('applies the variant and lets a class override it', () => {
  render(
    <Button variant="destructive" className="bg-blue-500">
      Delete
    </Button>,
  );

  const button = screen.getByRole('button', { name: 'Delete' });
  expect(button).toHaveClass('text-destructive-foreground', 'bg-blue-500');
  expect(button).not.toHaveClass('bg-destructive');
});
