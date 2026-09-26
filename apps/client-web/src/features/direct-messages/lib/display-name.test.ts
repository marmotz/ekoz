import { describe, expect, it } from 'vitest';

import { conversationDisplayName } from '@/features/direct-messages/lib/display-name';
import { participant } from '../../../../test/conversation-fixtures';

const UNKNOWN = 'Conversation';

describe('conversationDisplayName', () => {
  it('names a dm after the other person', () => {
    expect(
      conversationDisplayName(
        { type: 'dm', name: null, participants: [participant('u2', 'Bob')] },
        UNKNOWN,
      ),
    ).toBe('Bob');
  });

  it('falls back to the identifier, then to the placeholder', () => {
    const noName = participant('u2', 'Bob');
    noName.user.displayName = null;
    expect(
      conversationDisplayName({ type: 'dm', name: null, participants: [noName] }, UNKNOWN),
    ).toBe('bob/example.test');
    expect(conversationDisplayName({ type: 'dm', name: null, participants: [] }, UNKNOWN)).toBe(
      UNKNOWN,
    );
    expect(conversationDisplayName({ type: 'dm', name: null }, UNKNOWN)).toBe(UNKNOWN);
  });

  it('names a group after its name when it has one', () => {
    expect(
      conversationDisplayName(
        { type: 'group_dm', name: 'Trip', participants: [participant('u2', 'Bob')] },
        UNKNOWN,
      ),
    ).toBe('Trip');
  });

  it('lists the participants of an unnamed group, truncated after three', () => {
    const people = ['Bob', 'Carol', 'Dan', 'Eve', 'Fay'].map((name, i) =>
      participant(`u${i}`, name),
    );

    expect(
      conversationDisplayName(
        { type: 'group_dm', name: null, participants: people.slice(0, 2) },
        UNKNOWN,
      ),
    ).toBe('Bob, Carol');
    expect(
      conversationDisplayName({ type: 'group_dm', name: null, participants: people }, UNKNOWN),
    ).toBe('Bob, Carol, Dan +2');
  });

  it('uses the placeholder for an unnamed group nobody is known in', () => {
    expect(conversationDisplayName({ type: 'group_dm', name: null }, UNKNOWN)).toBe(UNKNOWN);
  });
});
