import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationFailedError } from './domain-error.js';
import type { ValidationIssue } from './problem-details.js';

/** A `createZodDto()` class carries its schema as a static `schema` property. */
type ZodDtoClass<T> = { schema: ZodType<T> };

function resolveSchema<T>(source: ZodType<T> | ZodDtoClass<T>): ZodType<T> {
  return typeof source === 'function' && 'schema' in source
    ? (source as ZodDtoClass<T>).schema
    : (source as ZodType<T>);
}

/**
 * Validates a controller argument against a Zod schema at the edge; the inferred
 * type then flows inward (ADR 0017, technical.md §10). A failure raises
 * `ValidationFailedError` → `422` + `code = "validation_failed"` + `errors`.
 *
 * Accepts either a raw Zod schema or a `createZodDto()` class (it unwraps the
 * class to its `.schema`), so a route can carry a single DTO class for both
 * validation and the OpenAPI `@ApiBody`.
 *
 * Usage: `@Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUser`.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  private readonly schema: ZodType<T>;

  constructor(source: ZodType<T> | ZodDtoClass<T>) {
    this.schema = resolveSchema(source);
  }

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
