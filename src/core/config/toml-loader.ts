import { readFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';

/** A flat `section.key -> value` map, the shape the resolver consumes. */
export type FlatConfig = Map<string, unknown>;

const ENV_INTERPOLATION = /\$\{([A-Z0-9_]+)}/g;

/**
 * Load a TOML config file and flatten it to dotted keys (ADR 0009, technical.md
 * §2). `${ENV_VAR}` references inside string values are substituted at load
 * time; an undefined variable throws.
 */
export function loadTomlConfig(path: string, env: NodeJS.ProcessEnv = process.env): FlatConfig {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Map();
    }

    throw error;
  }

  return flatten(parseToml(raw), env);
}

/** Flatten an already-parsed TOML object (used directly in tests). */
export function flattenTomlObject(obj: unknown, env: NodeJS.ProcessEnv = process.env): FlatConfig {
  return flatten(obj, env);
}

function flatten(obj: unknown, env: NodeJS.ProcessEnv, prefix = '', out: FlatConfig = new Map()): FlatConfig {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) {
      out.set(prefix, interpolate(obj, env));
    }

    return out;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, env, next, out);
    } else {
      out.set(next, interpolate(value, env));
    }
  }

  return out;
}

function interpolate(value: unknown, env: NodeJS.ProcessEnv): unknown {
  if (typeof value === 'string') {
    return value.replace(ENV_INTERPOLATION, (_, name: string) => {
      const resolved = env[name];
      if (resolved === undefined) {
        throw new Error(`Config interpolation failed: environment variable \${${name}} is not set`);
      }

      return resolved;
    });
  }

  if (Array.isArray(value)) {
    return value.map((v) => interpolate(v, env));
  }

  return value;
}
