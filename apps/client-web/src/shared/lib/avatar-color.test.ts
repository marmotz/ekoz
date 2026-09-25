import { describe, expect, it } from 'vitest';

import { avatarColors, hslToRgb, luminance } from '@/shared/lib/avatar-color';

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Reads the `hsl(h s% l%)` background back into a luminance. */
function backgroundLuminance(background: string): number {
  const match = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(background);
  if (!match) throw new Error(`unexpected background ${background}`);
  return luminance(hslToRgb(Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100));
}

describe('avatarColors', () => {
  it('always gives the same colors for the same key', () => {
    expect(avatarColors('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toEqual(
      avatarColors('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
    );
  });

  it('gives different backgrounds to different keys', () => {
    const backgrounds = new Set(
      Array.from({ length: 50 }, (_, i) => avatarColors(`user-${i}`).background),
    );

    expect(backgrounds.size).toBeGreaterThan(40);
  });

  it('picks the text color with the better contrast, readable on every background', () => {
    const texts = new Set<string>();

    for (let i = 0; i < 500; i += 1) {
      const { background, color } = avatarColors(`01ARZ3NDEKTSV4RRFFQ69G${i}`);
      const bg = backgroundLuminance(background);
      const chosen = color === '#ffffff' ? 1 : 0;
      const other = color === '#ffffff' ? 0 : 1;

      expect(contrast(bg, chosen)).toBeGreaterThanOrEqual(contrast(bg, other));
      expect(contrast(bg, chosen)).toBeGreaterThanOrEqual(4.5);
      texts.add(color);
    }

    // The palette covers dark and light backgrounds, so both text colors show up.
    expect(texts).toEqual(new Set(['#ffffff', '#000000']));
  });
});
