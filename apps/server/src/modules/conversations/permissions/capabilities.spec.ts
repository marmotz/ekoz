import { describe, expect, it } from 'vitest';
import { CAPABILITIES, isCapability } from './capabilities.js';

describe('capabilities (unit)', () => {
  it('recognises a declared capability', () => {
    expect(isCapability('room.read')).toBe(true);
    expect(isCapability('space.manage')).toBe(true);
  });

  it('rejects an unknown string', () => {
    expect(isCapability('room.nope')).toBe(false);
  });

  it('is a closed, non-empty set', () => {
    expect(CAPABILITIES.length).toBeGreaterThan(0);
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
  });
});
