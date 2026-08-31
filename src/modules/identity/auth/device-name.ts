/**
 * Best-effort device label from a `User-Agent`, used when the client does not
 * supply `deviceName` at login (technical.md §11, §14 issue #14).
 *
 * Deliberately coarse: "Browser on OS" / "App on OS". The user renames it from
 * the sessions screen; this is only the first guess.
 */
export function deriveDeviceName(userAgent: string | undefined | null): string {
  const ua = (userAgent ?? '').trim();
  if (ua === '') {
    return 'Unknown device';
  }

  const os =
    matchFirst(ua, [
      [/Windows NT/i, 'Windows'],
      [/iPhone|iPad|iPod/i, 'iOS'],
      [/Android/i, 'Android'],
      [/Mac OS X|Macintosh/i, 'macOS'],
      [/Linux/i, 'Linux'],
    ]) ?? null;

  const client =
    matchFirst(ua, [
      [/Edg\//i, 'Edge'],
      [/OPR\/|Opera/i, 'Opera'],
      [/Firefox\//i, 'Firefox'],
      [/Chrome\//i, 'Chrome'],
      [/Safari\//i, 'Safari'],
      [/curl\//i, 'curl'],
      [/EkozApp|okhttp|CFNetwork/i, 'Ekoz app'],
    ]) ?? null;

  if (client && os) {
    return `${client} on ${os}`;
  }

  if (client) {
    return client;
  }

  if (os) {
    return `Device on ${os}`;
  }

  return truncate(ua, 60);
}

function matchFirst(value: string, table: Array<[RegExp, string]>): string | undefined {
  for (const [pattern, label] of table) {
    if (pattern.test(value)) return label;
  }

  return undefined;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
