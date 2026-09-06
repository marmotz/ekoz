import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationFailedError } from './domain-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const BODY_META: ArgumentMetadata = { type: 'body' };

describe('ZodValidationPipe (unit)', () => {
  const schema = z.object({ email: z.email(), age: z.number().int().min(0) });
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed, typed value on success', () => {
    const out = pipe.transform({ email: 'a@b.com', age: 30 }, BODY_META);
    expect(out).toEqual({ email: 'a@b.com', age: 30 });
  });

  it('raises ValidationFailedError with a per-field errors array', () => {
    try {
      pipe.transform({ email: 'nope', age: -1 }, BODY_META);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationFailedError);
      const issues = (error as ValidationFailedError).issues;
      expect(issues.map((i) => i.path).sort()).toEqual(['body.age', 'body.email']);
      expect((error as ValidationFailedError).code).toBe('validation_failed');
      expect((error as ValidationFailedError).status).toBe(422);
    }
  });

  it('prefixes the path with the argument kind', () => {
    try {
      pipe.transform({ email: 'a@b.com' }, { type: 'query' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ValidationFailedError).issues[0]?.path).toBe('query.age');
    }
  });
});
