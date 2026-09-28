const UNIT_BYTES = { MB: 1_048_576, GB: 1_073_741_824 } as const;

export type ByteUnit = keyof typeof UNIT_BYTES;

/** Human-readable size for display (e.g. `250 MB`, `2 GB`), `null`/`undefined` shown as given. */
export function formatBytes(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!Number.isFinite(n)) return '—';
  if (n >= UNIT_BYTES.GB) return `${roundTo(n / UNIT_BYTES.GB, 2)} GB`;
  if (n >= UNIT_BYTES.MB) return `${roundTo(n / UNIT_BYTES.MB, 2)} MB`;
  return `${n} B`;
}

/** Picks the largest unit that represents `bytes` as a whole number, for editing. */
export function bytesToUnitAmount(bytes: number): { amount: number; unit: ByteUnit } {
  if (bytes !== 0 && bytes % UNIT_BYTES.GB === 0) {
    return { amount: bytes / UNIT_BYTES.GB, unit: 'GB' };
  }
  return { amount: bytes / UNIT_BYTES.MB, unit: 'MB' };
}

export function unitAmountToBytes(amount: number, unit: ByteUnit): number {
  return Math.round(amount * UNIT_BYTES[unit]);
}

function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
