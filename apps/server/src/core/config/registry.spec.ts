import { describe, expect, it } from 'vitest';
import {
  INFRA_KEYS,
  isParameterKey,
  PARAMETER_REGISTRY,
  type ParameterKey,
  RUNTIME_KEYS,
} from './registry.js';

describe('parameter registry (unit)', () => {
  it('parses every declared default against its own schema', () => {
    for (const [key, spec] of Object.entries(PARAMETER_REGISTRY)) {
      if ((spec as { default?: unknown }).default === undefined) continue;
      const result = spec.schema.safeParse((spec as { default: unknown }).default);
      expect(result.success, `${key} default should be valid: ${JSON.stringify(result)}`).toBe(
        true,
      );
    }
  });

  it('partitions keys into infra and runtime with no overlap', () => {
    const all = Object.keys(PARAMETER_REGISTRY) as ParameterKey[];
    expect([...INFRA_KEYS, ...RUNTIME_KEYS].sort()).toEqual(all.sort());
    expect(INFRA_KEYS.some((k) => RUNTIME_KEYS.includes(k))).toBe(false);
  });

  it('marks secrets and observability keys as the ADR specifies', () => {
    expect(PARAMETER_REGISTRY['database.url'].secret).toBe(true);
    expect(PARAMETER_REGISTRY['secret.key'].secret).toBe(true);
    expect(PARAMETER_REGISTRY['observability.metrics_token'].secret).toBe(true);
    expect(PARAMETER_REGISTRY['email.smtp.pass'].secret).toBe(true);
    expect(PARAMETER_REGISTRY['storage.s3.secret_access_key'].secret).toBe(true);
    // Connection targets are not credentials: shown in the boot summary / admin UI.
    expect(PARAMETER_REGISTRY['email.smtp.host'].secret).toBe(false);
    expect(PARAMETER_REGISTRY['storage.s3.endpoint'].secret).toBe(false);
    expect(PARAMETER_REGISTRY['observability.log_level'].kind).toBe('runtime');
    expect(PARAMETER_REGISTRY['observability.log_format'].kind).toBe('infra');
  });

  it('recognises only registered keys', () => {
    expect(isParameterKey('registration.mode')).toBe(true);
    expect(isParameterKey('nope.nothere')).toBe(false);
  });

  it('rejects localhost / IP for server.domain', () => {
    expect(PARAMETER_REGISTRY['server.domain'].schema.safeParse('localhost').success).toBe(false);
    expect(PARAMETER_REGISTRY['server.domain'].schema.safeParse('10.0.0.1').success).toBe(false);
    expect(PARAMETER_REGISTRY['server.domain'].schema.safeParse('ekoz.example.com').success).toBe(
      true,
    );
  });
});
