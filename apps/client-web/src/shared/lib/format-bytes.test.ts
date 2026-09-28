import { describe, expect, it } from 'vitest';

import { formatBytes } from '@/shared/lib/format-bytes';

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes('0')).toBe('0 B');
  });

  it('formats bytes below 1 KB with no decimals', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes, megabytes and gigabytes with one decimal', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });

  it('accepts a decimal string, as carried on the wire', () => {
    expect(formatBytes('1048576')).toBe('1.0 MB');
  });

  it('returns an empty string for an invalid size', () => {
    expect(formatBytes('not-a-number')).toBe('');
    expect(formatBytes(-1)).toBe('');
  });
});
