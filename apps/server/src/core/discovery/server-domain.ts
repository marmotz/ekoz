/**
 * `server.domain` validation (technical.md §4, ADR 0007).
 *
 * The canonical domain must be a real, lower-cased FQDN: at least two labels, a
 * letters-only TLD, no IP literal, not `localhost`. It is immutable for the
 * lifetime of a deployment — changing it would break every `name/server`
 * identifier — so the rule is enforced both in the config registry (at load)
 * and by the boot-time identity guard.
 */

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function isValidServerDomain(value: string): boolean {
  if (value !== value.toLowerCase() || value.length > 253) {
    return false;
  }

  if (value === 'localhost' || value.endsWith('.')) {
    return false;
  }

  if (IPV4.test(value) || value.includes(':')) {
    return false;
  }

  const labels = value.split('.');
  if (labels.length < 2) {
    return false;
  }

  if (!labels.every((label) => LABEL.test(label))) {
    return false;
  }

  const tld = labels.at(-1) ?? '';

  return /^[a-z]{2,}$/.test(tld);
}

export function assertValidServerDomain(value: string): void {
  if (!isValidServerDomain(value)) {
    throw new Error(
      `Invalid "server.domain" (${value}): must be a lower-cased public FQDN, not an IP address or localhost.`,
    );
  }
}
