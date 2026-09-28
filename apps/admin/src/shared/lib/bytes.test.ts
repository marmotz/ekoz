import { describe, expect, it } from 'vitest';
import { bytesToUnitAmount, formatBytes, unitAmountToBytes } from './bytes';

describe('formatBytes', () => {
  it('formats gigabytes', () => {
    expect(formatBytes(2 * 1_073_741_824)).toBe('2 GB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(250 * 1_048_576)).toBe('250 MB');
  });

  it('formats plain bytes below one megabyte', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('shows a dash for null or undefined', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
  });

  it('accepts a numeric string', () => {
    expect(formatBytes('1073741824')).toBe('1 GB');
  });
});

describe('bytesToUnitAmount', () => {
  it('picks GB when evenly divisible', () => {
    expect(bytesToUnitAmount(3 * 1_073_741_824)).toEqual({ amount: 3, unit: 'GB' });
  });

  it('falls back to MB otherwise', () => {
    expect(bytesToUnitAmount(1_572_864)).toEqual({ amount: 1.5, unit: 'MB' });
  });
});

describe('unitAmountToBytes', () => {
  it('converts MB and GB back to bytes', () => {
    expect(unitAmountToBytes(2, 'MB')).toBe(2_097_152);
    expect(unitAmountToBytes(1, 'GB')).toBe(1_073_741_824);
  });
});
