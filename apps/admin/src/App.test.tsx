import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from './App';

test('renders the console heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /ekoz admin console/i })).toBeInTheDocument();
});
