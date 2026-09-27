import { isIP } from 'node:net';

/**
 * Classifies whether a resolved IP address is safe to connect to from the
 * server (technical.md §S10): every non-public range is refused — loopback,
 * private (RFC 1918 / ULA), link-local (including the cloud metadata
 * address), CGNAT and multicast. An IPv4-mapped IPv6 address is unwrapped and
 * classified as its IPv4 form.
 */
export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isPublicIPv4(ip);
  }
  if (version === 6) {
    const mapped = unwrapIPv4MappedIPv6(ip);
    if (mapped) {
      return isPublicIPv4(mapped);
    }

    return isPublicIPv6(ip);
  }

  return false;
}

function unwrapIPv4MappedIPv6(ip: string): string | null {
  const lower = ip.toLowerCase();
  const match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);

  return match ? (match[1] ?? null) : null;
}

function isPublicIPv4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];

  if (a === 0) return false; // "this network"
  if (a === 127) return false; // loopback
  if (a === 10) return false; // private
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT (100.64.0.0/10)
  if (a === 169 && b === 254) return false; // link-local, incl. cloud metadata 169.254.169.254
  if (a >= 224 && a <= 239) return false; // multicast
  if (a === 255) return false; // broadcast / reserved

  return true;
}

function isPublicIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === '::1') return false; // loopback
  if (normalized === '::') return false; // unspecified
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return false; // link-local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return false; // ULA (fc00::/7)
  if (normalized.startsWith('ff')) return false; // multicast (ff00::/8)

  return true;
}
