import { describe, expect, it } from 'vitest';
import { MARK_READ_USAGE, parseMarkReadArgs } from './mark-read.js';

describe('parseMarkReadArgs', () => {
  it('joins the arguments into the channel name', () => {
    expect(parseMarkReadArgs(['Salon', '2'])).toEqual({ channelName: 'Salon 2' });
    expect(parseMarkReadArgs(['test'])).toEqual({ channelName: 'test' });
  });

  it('requires a channel name', () => {
    expect(() => parseMarkReadArgs([])).toThrow(MARK_READ_USAGE);
    expect(() => parseMarkReadArgs(['  '])).toThrow(MARK_READ_USAGE);
  });
});
