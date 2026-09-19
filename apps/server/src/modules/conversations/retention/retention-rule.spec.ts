import { describe, expect, it } from 'vitest';
import { effectiveRetentionRuleSchema, retentionRuleSchema } from './retention-rule.js';

describe('retentionRuleSchema (unit)', () => {
  it('accepts inherit, keep, hide and delete', () => {
    expect(retentionRuleSchema.safeParse({ mode: 'inherit' }).success).toBe(true);
    expect(retentionRuleSchema.safeParse({ mode: 'keep' }).success).toBe(true);
    expect(retentionRuleSchema.safeParse({ mode: 'hide', after: '30d' }).success).toBe(true);
    expect(retentionRuleSchema.safeParse({ mode: 'delete', after: 3600 }).success).toBe(true);
  });

  it('coerces a compact duration string on hide/delete', () => {
    const result = retentionRuleSchema.parse({ mode: 'hide', after: '15m' });
    expect(result).toEqual({ mode: 'hide', after: 900 });
  });

  it('rejects hide/delete without after', () => {
    expect(retentionRuleSchema.safeParse({ mode: 'hide' }).success).toBe(false);
    expect(retentionRuleSchema.safeParse({ mode: 'delete' }).success).toBe(false);
  });

  it('rejects an unknown mode', () => {
    expect(retentionRuleSchema.safeParse({ mode: 'archive' }).success).toBe(false);
  });
});

describe('effectiveRetentionRuleSchema (unit)', () => {
  it('rejects inherit — an effective rule is always resolved', () => {
    expect(effectiveRetentionRuleSchema.safeParse({ mode: 'inherit' }).success).toBe(false);
  });

  it('accepts keep, hide and delete', () => {
    expect(effectiveRetentionRuleSchema.safeParse({ mode: 'keep' }).success).toBe(true);
    expect(effectiveRetentionRuleSchema.safeParse({ mode: 'hide', after: '7d' }).success).toBe(
      true,
    );
  });
});
