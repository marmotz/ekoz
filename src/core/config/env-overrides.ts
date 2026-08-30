import { isParameterKey, type ParameterKey } from './registry.js';

/**
 * 12-factor overrides: `EKOZ_<SECTION>__<KEY>` where a double underscore maps to
 * a dot (ADR 0009, technical.md §2). `EKOZ_STORAGE__LOCAL__PATH` →
 * `storage.local.path`. Only keys present in the registry are returned; unknown
 * `EKOZ_*` variables are ignored.
 *
 * An env override on a `runtime` parameter locks it (handled by the resolver);
 * this function only reports which keys were set from the environment.
 */
export function readEnvOverrides(env: NodeJS.ProcessEnv = process.env): Map<ParameterKey, string> {
  const out = new Map<ParameterKey, string>();

  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || !name.startsWith('EKOZ_')) continue;
    const dotted = name.slice('EKOZ_'.length).toLowerCase().replaceAll('__', '.');
    if (isParameterKey(dotted)) out.set(dotted, value);
  }

  return out;
}
