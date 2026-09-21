import { describe, expect, it } from 'vitest';
import { toPreviewJoinRequest } from './room.view.js';

const row = (approved: boolean | null) => ({
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  createdAt: '2026-09-21T10:00:00.000Z',
  approved,
});

describe('toPreviewJoinRequest', () => {
  it('has no join request to show when there is none', () => {
    expect(toPreviewJoinRequest(null)).toBeNull();
  });

  it('maps an unresolved request to pending', () => {
    expect(toPreviewJoinRequest(row(null))).toEqual({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      createdAt: '2026-09-21T10:00:00.000Z',
      status: 'pending',
    });
  });

  it('maps a refused request to rejected', () => {
    expect(toPreviewJoinRequest(row(false))).toMatchObject({ status: 'rejected' });
  });

  it('hides an approved request', () => {
    expect(toPreviewJoinRequest(row(true))).toBeNull();
  });
});
