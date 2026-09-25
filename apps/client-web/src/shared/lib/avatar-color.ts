export interface AvatarColors {
  /** CSS background of the avatar. */
  background: string;
  /** CSS text color, dark or light, whichever reads better on `background`. */
  color: string;
}

const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#000000';
/** WCAG relative luminance of {@link LIGHT_TEXT} and {@link DARK_TEXT}. */
const LIGHT_LUMINANCE = 1;
const DARK_LUMINANCE = 0;

/** FNV-1a, 32 bits: cheap, stable across sessions and well spread over short ids. */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

/** Converts HSL (h in degrees, s and l in 0..1) to RGB channels in 0..1. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

/** WCAG relative luminance of an RGB color with channels in 0..1. */
export function luminance([r, g, b]: [number, number, number]): number {
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two relative luminances. */
function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * A background color derived from `key` (a user id), always the same for the same
 * key, and the text color that stays readable on it: the one with the higher WCAG
 * contrast ratio, white or black, which guarantees a ratio of at least 4.5.
 */
export function avatarColors(key: string): AvatarColors {
  const h = hash(key);
  const hue = h % 360;
  const saturation = 45 + ((h >>> 9) % 30);
  const lightness = 30 + ((h >>> 15) % 45);

  const l = luminance(hslToRgb(hue, saturation / 100, lightness / 100));
  const color =
    contrast(l, LIGHT_LUMINANCE) >= contrast(l, DARK_LUMINANCE) ? LIGHT_TEXT : DARK_TEXT;

  return { background: `hsl(${hue} ${saturation}% ${lightness}%)`, color };
}
