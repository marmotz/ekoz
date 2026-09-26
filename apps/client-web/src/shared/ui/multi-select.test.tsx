import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { MultiSelect } from '@/shared/ui/multi-select';

const OPTIONS = [
  { value: 'a', label: 'Alice' },
  { value: 'b', label: 'Bob' },
  { value: 'c', label: 'Carol' },
];

function Harness({ initial = [] }: { initial?: string[] }) {
  const [value, setValue] = useState(initial);

  return (
    <>
      <MultiSelect
        label="Members"
        emptyText="Nothing"
        removeLabel={(name) => `Remove ${name}`}
        options={OPTIONS}
        value={value}
        onChange={setValue}
      />
      <output aria-label="value">{value.join(',')}</output>
    </>
  );
}

const current = () => screen.getByLabelText('value').textContent;

describe('MultiSelect', () => {
  it('filters the options on the typed text', async () => {
    const actor = userEvent.setup();
    render(<Harness />);

    await actor.type(screen.getByRole('combobox'), 'CAR');

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Carol']);
  });

  it('keeps the list open, drops picked options and shows chips', async () => {
    const actor = userEvent.setup();
    render(<Harness />);

    await actor.click(screen.getByRole('combobox'));
    await actor.click(screen.getByRole('option', { name: 'Alice' }));
    await actor.click(screen.getByRole('option', { name: 'Carol' }));

    expect(current()).toBe('a,c');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Bob']);
    expect(screen.getByRole('button', { name: 'Remove Alice' })).toBeVisible();
  });

  it('picks with the keyboard and removes with Backspace', async () => {
    const actor = userEvent.setup();
    render(<Harness />);

    await actor.click(screen.getByRole('combobox'));
    await actor.keyboard('{ArrowDown}{Enter}');
    expect(current()).toBe('b');

    await actor.keyboard('{Backspace}');
    expect(current()).toBe('');
  });

  it('removes a chip with its button', async () => {
    const actor = userEvent.setup();
    render(<Harness initial={['a', 'b']} />);

    await actor.click(screen.getByRole('button', { name: 'Remove Alice' }));

    expect(current()).toBe('b');
  });

  it('shows the empty text when nothing matches, and closes on Escape', async () => {
    const actor = userEvent.setup();
    render(<Harness />);

    await actor.type(screen.getByRole('combobox'), 'zzz');
    expect(screen.getByText('Nothing')).toBeVisible();

    await actor.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
