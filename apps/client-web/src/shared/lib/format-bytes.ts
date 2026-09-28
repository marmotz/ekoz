const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Human-readable file size (`sizeBytes` on the wire is a decimal string). */
export function formatBytes(sizeBytes: string | number): string {
  const bytes = typeof sizeBytes === 'string' ? Number(sizeBytes) : sizeBytes;
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes === 0) return `0 ${UNITS[0]}`;

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const precision = exponent === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${UNITS[exponent]}`;
}
