import { createZodDto } from 'nestjs-zod';
import { ProblemDetailsSchema, ValidationIssueSchema } from './problem-details.schema.js';

/** `application/problem+json` body, as an OpenAPI component. */
export class ProblemDetailsDto extends createZodDto(ProblemDetailsSchema) {}

/** A single per-field validation issue, as an OpenAPI component. */
export class ValidationIssueDto extends createZodDto(ValidationIssueSchema) {}
