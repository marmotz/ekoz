import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationFailedError } from './domain-error.js';
import type { ValidationIssue } from './problem-details.js';

/**
 * Validates a controller argument against a Zod schema at the edge; the inferred
 * type then flows inward (ADR 0017, technical.md §10). A failure raises
 * `ValidationFailedError` → `422` + `code = "validation_failed"` + `errors`.
 *
 * Usage: `@Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUser`.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    const prefix = metadata.type === 'custom' ? 'body' : metadata.type;
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: [prefix, ...issue.path.map(String)].filter(Boolean).join('.'),
      message: issue.message,
    }));

    throw new ValidationFailedError(issues);
  }
}
