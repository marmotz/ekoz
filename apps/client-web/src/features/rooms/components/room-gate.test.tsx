import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { RoomGate } from '@/features/rooms/components/room-gate';

it('hands a writable room the caller is a member of to its children', () => {
  render(
    <RoomGate roomId="r1">
      {({ room, capabilities, membership }) => (
        <p>{`${room.id}|${room.readOnly}|${capabilities.join(',')}|${membership}`}</p>
      )}
    </RoomGate>,
  );

  expect(screen.getByText('r1|false|room.read,room.post|member')).toBeInTheDocument();
});
