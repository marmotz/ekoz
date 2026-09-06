import { describe, expect, it } from 'vitest';
import type { ProblemDetails } from './problem-details.js';
import { ProblemDetailsSchema, ValidationIssueSchema } from './problem-details.schema.js';

describe('ProblemDetailsSchema (unit)', () => {
  it('round-trips a plain domain-error problem+json body', () => {
    const body: ProblemDetails = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'The thing exploded.',
      code: 'things.exploded',
      requestId: '00000000-0000-4000-8000-000000000000',
    };

    expect(ProblemDetailsSchema.parse(body)).toEqual(body);
  });

  it('round-trips a validation_failed body with an errors array', () => {
    const body: ProblemDetails = {
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: 422,
      detail: 'Validation failed.',
      code: 'validation_failed',
      errors: [
        { path: 'body.email', message: 'Invalid email address' },
        { path: 'body.age', message: 'Too small' },
      ],
    };

    const parsed = ProblemDetailsSchema.parse(body);
    expect(parsed.errors).toHaveLength(2);
    expect(ValidationIssueSchema.parse(body.errors?.[0])).toEqual(body.errors?.[0]);
  });

  it('rejects a body missing the machine-readable code', () => {
    expect(
      ProblemDetailsSchema.safeParse({
        type: 'about:blank',
        title: 'Bad',
        status: 400,
        detail: 'x',
      }).success,
    ).toBe(false);
  });
});
