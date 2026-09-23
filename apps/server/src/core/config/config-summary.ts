import { type ConfigService, SECRET_MASK } from './config.service.js';
import { PARAMETER_REGISTRY, type ParameterKey, type ParameterSpec } from './registry.js';

/** Shown for an optional parameter that resolves to nothing. */
export const UNSET = '<unset>';

/**
 * The resolved configuration as human-readable lines, one per top-level section
 * (`email`, `storage`, …), for the boot log (docs/technical/boot-config-summary.md):
 *
 *   [email] driver=smtp smtp.host=mail.example.com (env) smtp.port=587 (file) …
 *
 * A value not coming from the code default is suffixed with its source. Secret
 * values are masked (`[secret]`) or, for `redactAs: 'url'`, shown without their
 * password and query string. An unset secret shows `<unset>`: whether it is
 * configured is useful and reveals nothing.
 */
export function buildConfigSummary(config: ConfigService): string[] {
  const sections = new Map<string, string[]>();

  for (const key of Object.keys(PARAMETER_REGISTRY) as ParameterKey[]) {
    const dot = key.indexOf('.');
    const section = key.slice(0, dot);
    const entries = sections.get(section) ?? [];
    entries.push(`${key.slice(dot + 1)}=${describeEntry(config, key)}`);
    sections.set(section, entries);
  }

  return [...sections].map(([section, entries]) => `[${section}] ${entries.join(' ')}`);
}

function describeEntry(config: ConfigService, key: ParameterKey): string {
  const spec = PARAMETER_REGISTRY[key] as ParameterSpec;

  let rendered: string;
  let source: string;
  try {
    const described = config.describe(key);
    source = described.source;
    rendered = renderValue(spec, described.value, () => config.get(key));
  } catch (error) {
    // A runtime override stored in the settings table can fail validation;
    // the summary reports it instead of aborting the boot.
    return `<invalid: ${(error as Error).message}>`;
  }

  return source === 'default' ? rendered : `${rendered} (${source})`;
}

function renderValue(spec: ParameterSpec, described: unknown, real: () => unknown): string {
  if (!spec.secret) {
    return formatValue(described);
  }

  const value = real();
  if (value === undefined || value === '') {
    return UNSET;
  }

  if (spec.redactAs === 'url') {
    return redactUrl(String(value)) ?? SECRET_MASK;
  }

  return SECRET_MASK;
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return UNSET;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => formatValue(item)).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  const text = String(value);
  return text === '' || /\s|"/.test(text) ? JSON.stringify(text) : text;
}

/** `scheme://user:pass@host/path?q` → `scheme://user:***@host/path`; `null` if not a URL. */
export function redactUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (!url.host) {
    return null;
  }

  if (url.password) {
    url.password = '***';
  }

  url.search = '';
  url.hash = '';

  return url.toString();
}
